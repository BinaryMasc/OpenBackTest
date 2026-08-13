import { create } from 'zustand';
import type { MarketSymbol } from '../types';
import type { MarketDataConnection, MarketDataSubscription } from '../services/marketData';
import {
  DEFAULT_MARKET_DATA_SOURCE_ID,
  getMarketDataSource
} from '../services/marketDataRegistry';
import { useBacktestStore } from './useBacktestStore';

interface MarketDataState {
  sourceId: string | null;
  sourceName: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  symbols: MarketSymbol[];
  symbol: string | null;
  connectionRef: MarketDataConnection | null;
  subscriptionRef: MarketDataSubscription | null;

  connectSource: (sourceId: string) => Promise<void>;
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
  isLoading: false,
  error: null,
  symbols: [],
  symbol: null,
  connectionRef: null,
  subscriptionRef: null,

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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Market-data connection failed';
}

function closeActiveConnection(state: Pick<MarketDataState, 'subscriptionRef' | 'pollingRef' | 'connectionRef'>) {
  const subscription = state.pollingRef ?? state.subscriptionRef;
  subscription?.close();
  state.connectionRef?.close();
}

export const useMarketDataStore = create<MarketDataState>((set, get) => ({
  ...initialState,

  connectSource: async (sourceId: string) => {
    const requestId = ++connectionRequestId;
    closeActiveConnection(get());

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

    set({
      ...initialState,
      sourceId: source.id,
      sourceName: source.name,
      isLoading: true,
      error: null,
      ...getBinanceCompatibilityState(source.id, false, true, [], null)
    });

    try {
      const connection = await source.connect();
      const symbols = await connection.listSymbols();

      if (requestId !== connectionRequestId) {
        connection.close();
        return;
      }

      set({
        sourceId: connection.sourceId,
        sourceName: connection.sourceName,
        isConnected: true,
        isLoading: false,
        symbols,
        connectionRef: connection,
        ...getBinanceCompatibilityState(connection.sourceId, true, false, symbols, null)
      });

      const firstSymbol = symbols[0]?.symbol;
      if (firstSymbol) {
        await get().setSymbol(firstSymbol);
      }
    } catch (error) {
      if (requestId !== connectionRequestId) return;

      set({
        ...initialState,
        error: getErrorMessage(error),
        ...getBinanceCompatibilityState(null, false, false, [], null)
      });
    }
  },

  connectDefaultSource: () => get().connectSource(DEFAULT_MARKET_DATA_SOURCE_ID),

  disconnectSource: () => {
    connectionRequestId += 1;
    symbolRequestId += 1;
    closeActiveConnection(get());

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
        ...getBinanceCompatibilityState(get().sourceId, true, false, get().symbols, subscription)
      });
    } catch (error) {
      if (requestId !== symbolRequestId) return;
      set({
        isLoading: false,
        error: getErrorMessage(error),
        ...getBinanceCompatibilityState(get().sourceId, true, false, get().symbols, null)
      });
    }
  },

  connectBinance: () => get().connectSource('binance'),
  disconnectBinance: () => get().disconnectSource()
}));
