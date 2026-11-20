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
import { getErrorMessage as toErrorMessage } from '../lib/errors';

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

    set({
      symbol,
      isConnectionLost: false,
      isDataStale: false,
      lastDataReceivedAt: null,
      isLoading: true,
      error: null,
      subscriptionRef: null
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
