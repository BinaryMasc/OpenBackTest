import { create } from 'zustand';
import { BinanceService } from '../services/binance';
import { useBacktestStore } from './useBacktestStore';

interface BinanceState {
  isBinanceConnected: boolean;
  isBinanceLoading: boolean;
  binanceSymbols: string[];
  symbol: string | null;
  pollingRef: { close: () => void } | null;

  connectBinance: () => Promise<void>;
  disconnectBinance: () => void;
  setSymbol: (symbol: string) => Promise<void>;
}

export const useBinanceStore = create<BinanceState>((set, get) => ({
  isBinanceConnected: false,
  isBinanceLoading: false,
  binanceSymbols: [],
  symbol: null,
  pollingRef: null,

  connectBinance: async () => {
    try {
      set({ isBinanceLoading: true });
      const symbols = await BinanceService.fetchFuturesSymbols();
      set({
        isBinanceConnected: true,
        isBinanceLoading: false,
        binanceSymbols: symbols,
        symbol: symbols[0] || 'BTCUSDT'
      });
      // Automatically load the default symbol
      if (symbols.length > 0) {
        get().setSymbol(symbols[0] || 'BTCUSDT');
      }
    } catch (e) {
      console.error('Failed to connect to Binance', e);
      set({ isBinanceConnected: false, isBinanceLoading: false });
    }
  },

  disconnectBinance: () => {
    const { pollingRef } = get();
    if (pollingRef) {
      pollingRef.close();
    }
    set({ isBinanceConnected: false, pollingRef: null, symbol: null });
  },

  setSymbol: async (symbol: string) => {
    const { pollingRef } = get();
    if (pollingRef) {
      pollingRef.close();
    }

    set({ symbol, isBinanceLoading: true });

    const backtestStore = useBacktestStore.getState();

    // Clear existing data immediately to show loading state
    backtestStore.loadData([], symbol);

    try {
      const parsedCandles = await BinanceService.fetchHistoricalKlines(symbol, '1m', 10000);

      // Prevent race conditions: if symbol changed while we were fetching, abort
      if (get().symbol !== symbol) return;

      backtestStore.loadData(parsedCandles, symbol);
      set({ isBinanceLoading: false });

      // Start real-time polling
      const polling = BinanceService.startLiveCandlePolling(symbol, '1m', (liveCandle) => {
        useBacktestStore.getState().updateLiveCandle(liveCandle);
      });

      set({ pollingRef: polling });
    } catch (e) {
      console.error('Failed to load historical data', e);
      set({ isBinanceLoading: false });
    }
  }
}));
