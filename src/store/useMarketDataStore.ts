import { create } from 'zustand';
import type { MarketSymbol } from '../types';
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

  connectSource: (sourceId: string, options?: MarketDataConnectionOptions) => Promise<void>;
  connectDefaultSource: () => Promise<void>;
  disconnectSource: () => void;
  setSymbol: (symbol: string) => Promise<void>;

  /** Compatibility aliases for existing Binance integrations. */
  isBinanceConnected: boolean;
  isBinanceLoading: boolean;
  binanceSymbols: string[];
  pollingRef: MarketDataSubscription | null;
  connectBinance: () => Promise<void>;
  disconnectBinance: () => void;
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

  // Deprecated fields retained so existing consumers can migrate gradually.
  isBinanceConnected: false,
  isBinanceLoading: false,
  binanceSymbols: [],
  pollingRef: null
};

const getBinanceCompatibilityState = (
  sourceId: string | null,
  isConnected: boolean,
  isLoading: boolean,
  symbols: MarketSymbol[],
  subscriptionRef: MarketDataSubscription | null
) => ({
  isBinanceConnected: sourceId === 'binance' && isConnected,
  isBinanceLoading: sourceId === 'binance' && isLoading,
  binanceSymbols: sourceId === 'binance' ? symbols.map(item => item.symbol) : [],
  pollingRef: sourceId === 'binance' ? subscriptionRef : null
});

let connectionRequestId = 0;
let symbolRequestId = 0;
let pendingConnectionAbortController: AbortController | null = null;
export const RITHMIC_DATA_STALE_AFTER_MS = 30_000;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Market-data connection failed';
}

function closeActiveConnection(state: Pick<MarketDataState, 'subscriptionRef' | 'pollingRef' | 'statusSubscriptionRef' | 'connectionRef'>) {
  const subscription = state.pollingRef ?? state.subscriptionRef;
  subscription?.close();
  state.statusSubscriptionRef?.close();
  state.connectionRef?.close();
}

function abortPendingConnection() {
  pendingConnectionAbortController?.abort();
  pendingConnectionAbortController = null;
}

export const useMarketDataStore = create<MarketDataState>((set, get) => {
  let staleDataTimer: ReturnType<typeof setInterval> | null = null;

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

  connectSource: async (sourceId: string, options?: MarketDataConnectionOptions) => {
    const requestId = ++connectionRequestId;
    abortPendingConnection();
    closeActiveConnection(get());
    stopStaleDataMonitor();

    const source = getMarketDataSource(sourceId);
    if (!source) {
      set({
        ...initialState,
        isLoading: false,
        error: `Unknown market-data source: ${sourceId}`,
        ...getBinanceCompatibilityState(null, false, false, [], null)
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
      error: null,
      ...getBinanceCompatibilityState(source.id, false, true, [], null)
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
        connectionRef: connection,
        ...getBinanceCompatibilityState(connection.sourceId, true, false, symbols, null)
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
        error: getErrorMessage(error),
        ...getBinanceCompatibilityState(null, false, false, [], null)
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
    closeActiveConnection(get());
    stopStaleDataMonitor();

    set({
      ...initialState,
      ...getBinanceCompatibilityState(null, false, false, [], null)
    });
  },

  setSymbol: async (symbol: string) => {
    // This keeps the old direct Binance action usable while all normal UI
    // flows go through connectSource first.
    if (!get().isConnected || !get().connectionRef) {
      await get().connectDefaultSource();
      if (get().symbol === symbol) return;
    }

    const connection = get().connectionRef;
    if (!connection) return;

    const requestId = ++symbolRequestId;
    const previousSubscription = get().subscriptionRef ?? get().pollingRef;
    previousSubscription?.close();

    set({
      symbol,
      isConnectionLost: false,
      isDataStale: false,
      lastDataReceivedAt: null,
      isLoading: true,
      error: null,
      subscriptionRef: null,
      ...getBinanceCompatibilityState(get().sourceId, true, true, get().symbols, null)
    });

    const backtestStore = useBacktestStore.getState();
    backtestStore.loadData([], symbol);

    try {
      const parsedCandles = await connection.fetchHistoricalCandles(symbol, '1m', 10000);

      if (
        requestId !== symbolRequestId ||
        get().connectionRef !== connection ||
        get().symbol !== symbol
      ) {
        return;
      }

      backtestStore.loadData(parsedCandles, symbol);
      set({
        isLoading: false,
        ...getBinanceCompatibilityState(get().sourceId, true, false, get().symbols, null)
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
        isDataStale: false,
        ...getBinanceCompatibilityState(get().sourceId, true, false, get().symbols, subscription)
      });
    } catch (error) {
      if (requestId !== symbolRequestId) return;
      set({
        isLoading: false,
        isDataStale: get().sourceId === 'rithmic',
        error: getErrorMessage(error),
        ...getBinanceCompatibilityState(get().sourceId, true, false, get().symbols, null)
      });
    }
  },

  connectBinance: () => get().connectSource('binance'),
  disconnectBinance: () => get().disconnectSource()
  });
});
