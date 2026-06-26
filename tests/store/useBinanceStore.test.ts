import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useBinanceStore } from '../../src/store/useBinanceStore';
import { useBacktestStore } from '../../src/store/useBacktestStore';
import { BinanceService } from '../../src/services/binance';

describe('useBinanceStore', () => {
  beforeEach(() => {
    // Reset stores
    useBinanceStore.setState({
      isBinanceConnected: false,
      isBinanceLoading: false,
      binanceSymbols: [],
      symbol: null,
      pollingRef: null,
    });
    
    useBacktestStore.setState({
      rawData: [],
      symbol: '',
      currentIndex: -1
    });

    // Mock BinanceService
    vi.spyOn(BinanceService, 'fetchFuturesSymbols').mockResolvedValue(['BTCUSDT', 'ETHUSDT']);
    vi.spyOn(BinanceService, 'fetchHistoricalKlines').mockResolvedValue([
      { time: 1000, open: 1, high: 2, low: 0, close: 1.5, volume: 100 }
    ]);
    vi.spyOn(BinanceService, 'startLiveCandlePolling').mockReturnValue({ close: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should connect to Binance and fetch symbols', async () => {
    await useBinanceStore.getState().connectBinance();
    
    const state = useBinanceStore.getState();
    expect(state.isBinanceConnected).toBe(true);
    expect(state.binanceSymbols).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(state.symbol).toBe('BTCUSDT'); // Automatically loads first symbol
  });

  it('should disconnect from Binance and clear polling', async () => {
    // Set up active state
    const mockClose = vi.fn();
    useBinanceStore.setState({
      isBinanceConnected: true,
      symbol: 'BTCUSDT',
      pollingRef: { close: mockClose }
    });

    useBinanceStore.getState().disconnectBinance();
    
    const state = useBinanceStore.getState();
    expect(state.isBinanceConnected).toBe(false);
    expect(state.symbol).toBeNull();
    expect(state.pollingRef).toBeNull();
    expect(mockClose).toHaveBeenCalled();
  });

  it('should fetch historical data and start polling on setSymbol', async () => {
    await useBinanceStore.getState().setSymbol('ETHUSDT');
    
    const state = useBinanceStore.getState();
    expect(state.symbol).toBe('ETHUSDT');
    expect(state.pollingRef).not.toBeNull();
    
    // Ensure backtest store was loaded
    const backtestState = useBacktestStore.getState();
    expect(backtestState.symbol).toBe('ETHUSDT');
    expect(backtestState.rawData.length).toBe(1);
    expect(BinanceService.fetchHistoricalKlines).toHaveBeenCalledWith('ETHUSDT', '1m', 10000);
    expect(BinanceService.startLiveCandlePolling).toHaveBeenCalled();
  });
});
