import { create } from 'zustand';
import type { Candle, MarketSymbol, Timeframe } from '../types';
import { BINANCE_HISTORY_LIMITS, BinanceService, getDefaultBinanceHistoryLimit } from '../services/binance';
import type {
  MarketDataConnection,
  MarketDataConnectionOptions,
  MarketDataSubscription,
  MarketDataConnectionStatus
} from '../services/marketData';
import {
  DEFAULT_MARKET_DATA_SOURCE_ID,
  getMarketDataSource
} from '../services/marketDataRegistry';
import { useBacktestStore } from './useBacktestStore';
import { fillShortCandleGaps } from '../utils/candleGaps';
import { getErrorMessage as toErrorMessage } from '../lib/errors';

interface BinanceHistory {
  candles?: Candle[];
  isLoading: boolean;
  error: string | null;
}

interface BinanceFeed {
  controller: AbortController;
  subscription?: MarketDataSubscription;
}

interface MarketDataState {
  sourceId: string | null;
  sourceName: string | null;
  isConnected: boolean;
  isConnectionLost: boolean;
  isDataStale: boolean;
  lastDataReceivedAt: number | null;
  isLoading: boolean;
  error: string | null;
  symbols: MarketSymbol[];
  symbol: string | null;
  connectionRef: MarketDataConnection | null;
  subscriptionRef: MarketDataSubscription | null;
  statusSubscriptionRef: MarketDataSubscription | null;
  binanceHistory: Partial<Record<Timeframe, BinanceHistory>>;
  binanceHistoryLimits: Partial<Record<Timeframe, number>>;

  connectSource: (sourceId: string, options?: MarketDataConnectionOptions) => Promise<void>;
  connectDefaultSource: () => Promise<void>;
  disconnectSource: () => void;
  setSymbol: (symbol: string) => Promise<void>;
  syncBinanceTimeframes: () => Promise<void>;
  reloadBinanceHistory: (timeframe: Timeframe) => Promise<void>;
  setBinanceHistoryLimit: (timeframe: Timeframe, limit: number) => Promise<void>;
}

const initialState = {
  sourceId: null,
  sourceName: null,
  isConnected: false,
  isConnectionLost: false,
  isDataStale: false,
  lastDataReceivedAt: null,
  isLoading: false,
  error: null,
  symbols: [],
  symbol: null,
  connectionRef: null,
  subscriptionRef: null,
  statusSubscriptionRef: null,
  binanceHistory: {},
};

let connectionRequestId = 0;
let symbolRequestId = 0;
let pendingConnectionAbortController: AbortController | null = null;
export const RITHMIC_DATA_STALE_AFTER_MS = 30_000;

function getErrorMessage(error: unknown): string {
  return toErrorMessage(error, 'Market-data connection failed');
}

function closeActiveConnection(state: Pick<MarketDataState, 'subscriptionRef' | 'statusSubscriptionRef' | 'connectionRef'>) {
  state.subscriptionRef?.close();
  state.statusSubscriptionRef?.close();
  state.connectionRef?.close();
}

function abortPendingConnection() {
  pendingConnectionAbortController?.abort();
  pendingConnectionAbortController = null;
}

export const useMarketDataStore = create<MarketDataState>((set, get) => {
  let staleDataTimer: ReturnType<typeof setInterval> | null = null;
  const binanceFeeds = new Map<Timeframe, BinanceFeed>();

  const stopBinanceFeed = (timeframe: Timeframe) => {
    const feed = binanceFeeds.get(timeframe);
    binanceFeeds.delete(timeframe);
    feed?.controller.abort();
    feed?.subscription?.close();
  };

  const stopBinanceFeeds = () => {
    for (const timeframe of binanceFeeds.keys()) stopBinanceFeed(timeframe);
  };

  const reloadBinanceHistory = async (timeframe: Timeframe) => {
    const { connectionRef: connection, symbol, binanceHistoryLimits } = get();
    if (connection?.sourceId !== BinanceService.id || !symbol) return;

    stopBinanceFeed(timeframe);
    const feed: BinanceFeed = { controller: new AbortController() };
    binanceFeeds.set(timeframe, feed);
    const isCurrentFeed = () => binanceFeeds.get(timeframe) === feed;
    const isMinute = timeframe === '1m';

    const setStatus = (isLoading: boolean, error: string | null, candles?: Candle[]) => {
      set(state => ({
        ...(isMinute ? { isLoading, error } : {}),
        binanceHistory: {
          ...state.binanceHistory,
          [timeframe]: {
            isLoading,
            error,
            candles: candles ?? state.binanceHistory[timeframe]?.candles
          }
        }
      }));
    };

    setStatus(true, null);
    try {
      const limit = binanceHistoryLimits[timeframe] ?? getDefaultBinanceHistoryLimit(timeframe);
      const candles = await connection.fetchHistoricalCandles(symbol, timeframe, limit, feed.controller.signal);
      if (!isCurrentFeed()) return;

      if (isMinute) useBacktestStore.getState().loadData(candles, symbol, true);
      setStatus(false, null, isMinute ? undefined : candles);
    } catch (error) {
      if (!isCurrentFeed()) return;
      setStatus(false, getErrorMessage(error));
    }

    if (!isCurrentFeed()) return;
    const subscription = connection.subscribeCandles(symbol, timeframe, candle => {
      if (!isCurrentFeed()) return;
      if (isMinute) {
        useBacktestStore.getState().updateLiveCandle(candle);
        set({ lastDataReceivedAt: Date.now() });
        return;
      }

      const history = get().binanceHistory[timeframe];
      if (!history) return;
      const candles = history.candles ?? [];
      const last = candles.at(-1);
      const index = !last || candle.time > last.time
        ? candles.length
        : candle.time === last.time ? candles.length - 1 : candles.length - 2;
      const previous = candles[index];
      if (index < candles.length && previous?.time !== candle.time) return;
      if (previous && previous.open === candle.open && previous.high === candle.high
        && previous.low === candle.low && previous.close === candle.close && previous.volume === candle.volume) return;

      const updatedCandles = [...candles];
      updatedCandles[index] = candle;
      set(state => ({
        binanceHistory: { ...state.binanceHistory, [timeframe]: { ...history, candles: updatedCandles } }
      }));
    });

    if (isCurrentFeed()) feed.subscription = subscription;
    else subscription.close();
  };

  const syncBinanceTimeframes = async () => {
    if (get().connectionRef?.sourceId !== BinanceService.id || !get().symbol) return;

    // The backtest store uses minute candles for the current price and tick.
    const timeframes = new Set<Timeframe>(['1m', ...useBacktestStore.getState().charts.map(chart => chart.timeframe)]);
    for (const timeframe of binanceFeeds.keys()) {
      if (timeframes.has(timeframe)) continue;
      stopBinanceFeed(timeframe);
      const binanceHistory = { ...get().binanceHistory };
      delete binanceHistory[timeframe];
      set({ binanceHistory });
    }

    await Promise.all([...timeframes].filter(timeframe => !binanceFeeds.has(timeframe)).map(reloadBinanceHistory));
  };

  const stopStaleDataMonitor = () => {
    if (staleDataTimer) clearInterval(staleDataTimer);
    staleDataTimer = null;
  };

  const updateStaleDataState = () => {
    const state = get();
    const shouldCheck = state.sourceId === 'rithmic'
      && state.isConnected
      && !state.isConnectionLost
      && state.lastDataReceivedAt !== null;
    const isDataStale = shouldCheck
      && Date.now() - state.lastDataReceivedAt! >= RITHMIC_DATA_STALE_AFTER_MS;

    if (state.isDataStale !== isDataStale) set({ isDataStale });
  };

  const startStaleDataMonitor = () => {
    stopStaleDataMonitor();
    staleDataTimer = setInterval(updateStaleDataState, 1000);
  };

  const handleConnectionStatus = (
    connection: MarketDataConnection,
    status: MarketDataConnectionStatus
  ) => {
    if (get().connectionRef !== connection) return;
    if (status === 'disconnected') {
      set({
        isConnected: false,
        isConnectionLost: true,
        isDataStale: true,
        isLoading: false,
        error: `${get().sourceName || 'Market-data'} connection disconnected`
      });
      stopStaleDataMonitor();
    }
  };

  return ({
  ...initialState,
  binanceHistoryLimits: {},

  syncBinanceTimeframes,
  reloadBinanceHistory,
  setBinanceHistoryLimit: async (timeframe, limit) => {
    if (!BINANCE_HISTORY_LIMITS.includes(limit)) return;
    set(state => ({ binanceHistoryLimits: { ...state.binanceHistoryLimits, [timeframe]: limit } }));
    await reloadBinanceHistory(timeframe);
  },

  connectSource: async (sourceId: string, options?: MarketDataConnectionOptions) => {
    const requestId = ++connectionRequestId;
    abortPendingConnection();
    stopBinanceFeeds();
    closeActiveConnection(get());
    stopStaleDataMonitor();

    const source = getMarketDataSource(sourceId);
    if (!source) {
      set({
        ...initialState,
        isLoading: false,
        error: `Unknown market-data source: ${sourceId}`
      });
      return;
    }

    const abortController = new AbortController();
    const externalSignal = options?.signal;
    const abortFromExternalSignal = () => abortController.abort();
    if (externalSignal?.aborted) {
      abortController.abort();
    } else {
      externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });
    }
    pendingConnectionAbortController = abortController;

    set({
      ...initialState,
      sourceId: source.id,
      sourceName: source.name,
      isLoading: true,
      error: null
    });

    try {
      const connection = await source.connect({ ...options, signal: abortController.signal });
      const symbols = await connection.listSymbols();

      if (abortController.signal.aborted || requestId !== connectionRequestId) {
        connection.close();
        return;
      }

      set({
        sourceId: connection.sourceId,
        sourceName: connection.sourceName,
        isConnected: true,
        isConnectionLost: false,
        isDataStale: false,
        lastDataReceivedAt: null,
        isLoading: false,
        symbols,
        connectionRef: connection
      });

      const statusSubscription = connection.subscribeStatus?.(status => {
        handleConnectionStatus(connection, status);
      }) ?? null;
      set({ statusSubscriptionRef: statusSubscription });
      startStaleDataMonitor();

      const firstSymbol = symbols[0]?.symbol;
      if (firstSymbol) {
        await get().setSymbol(firstSymbol);
      }
    } catch (error) {
      if (abortController.signal.aborted || requestId !== connectionRequestId) return;

      set({
        ...initialState,
        error: getErrorMessage(error)
      });
    } finally {
      externalSignal?.removeEventListener('abort', abortFromExternalSignal);
      if (pendingConnectionAbortController === abortController) {
        pendingConnectionAbortController = null;
      }
    }
  },

  connectDefaultSource: () => get().connectSource(DEFAULT_MARKET_DATA_SOURCE_ID),

  disconnectSource: () => {
    connectionRequestId += 1;
    symbolRequestId += 1;
    abortPendingConnection();
    stopBinanceFeeds();
    closeActiveConnection(get());
    stopStaleDataMonitor();

    set({
      ...initialState
    });
  },

  setSymbol: async (symbol: string) => {
    // Selecting a symbol without a connection connects the default source.
    if (!get().isConnected || !get().connectionRef) {
      await get().connectDefaultSource();
      if (get().symbol === symbol) return;
    }

    const connection = get().connectionRef;
    if (!connection) return;

    const requestId = ++symbolRequestId;
    get().subscriptionRef?.close();
    stopBinanceFeeds();

    set({
      symbol,
      isConnectionLost: false,
      isDataStale: false,
      lastDataReceivedAt: null,
      isLoading: true,
      error: null,
      subscriptionRef: null,
      binanceHistory: {}
    });

    const backtestStore = useBacktestStore.getState();
    backtestStore.loadData([], symbol);

    if (connection.sourceId === BinanceService.id) {
      await syncBinanceTimeframes();
      return;
    }

    try {
      const parsedCandles = await connection.fetchHistoricalCandles(symbol, '1m', 10000);

      if (
        requestId !== symbolRequestId ||
        get().connectionRef !== connection ||
        get().symbol !== symbol
      ) {
        return;
      }

      // Trade-replay feeds (Rithmic) only emit minutes that traded; fill
      // short quiet gaps with flat bars so the chart looks continuous.
      const candles = connection.sourceId === 'rithmic' ? fillShortCandleGaps(parsedCandles) : parsedCandles;
      backtestStore.loadData(candles, symbol);
      set({
        isLoading: false
      });

      const subscription = connection.subscribeCandles(symbol, '1m', liveCandle => {
        if (get().connectionRef !== connection || get().symbol !== symbol) return;
        set({
          lastDataReceivedAt: Date.now(),
          isDataStale: false,
          isConnectionLost: false
        });
        useBacktestStore.getState().updateLiveCandle(liveCandle);
      });

      if (
        requestId !== symbolRequestId ||
        get().connectionRef !== connection ||
        get().symbol !== symbol
      ) {
        subscription.close();
        return;
      }

      set({
        subscriptionRef: subscription,
        lastDataReceivedAt: Date.now(),
        isDataStale: false
      });
    } catch (error) {
      if (requestId !== symbolRequestId) return;
      set({
        isLoading: false,
        isDataStale: get().sourceId === 'rithmic',
        error: getErrorMessage(error)
      });
    }
  }
  });
});
