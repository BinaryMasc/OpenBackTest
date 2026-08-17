import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candle } from '../../src/types';
import type { MarketDataConnection } from '../../src/services/marketData';
import { registerMarketDataSource } from '../../src/services/marketDataRegistry';
import { useMarketDataStore } from '../../src/store/useMarketDataStore';
import { useBacktestStore } from '../../src/store/useBacktestStore';

describe('useMarketDataStore', () => {
  const closeSubscription = vi.fn();
  const closeConnection = vi.fn();
  let onCandle: ((candle: Candle) => void) | undefined;

  const connection: MarketDataConnection = {
    sourceId: 'test-source',
    sourceName: 'Test Source',
    listSymbols: async () => [{ symbol: 'TEST', exchange: 'TESTEX', assetType: 'futures' }],
    fetchHistoricalCandles: async () => [
      { time: 1000, open: 10, high: 12, low: 9, close: 11, volume: 5 }
    ],
    subscribeCandles: (_symbol, _interval, callback) => {
      onCandle = callback;
      return { close: closeSubscription };
    },
    close: closeConnection
  };

  beforeEach(() => {
    useMarketDataStore.getState().disconnectSource();
    useBacktestStore.setState({ rawData: [], symbol: '', currentIndex: -1 });
    closeSubscription.mockReset();
    closeConnection.mockReset();
    onCandle = undefined;

    registerMarketDataSource({
      id: 'test-source',
      name: 'Test Source',
      connect: async () => connection
    });
  });

  it('connects a provider, loads its first symbol, and streams normalized candles', async () => {
    await useMarketDataStore.getState().connectSource('test-source');

    const state = useMarketDataStore.getState();
    expect(state.sourceId).toBe('test-source');
    expect(state.sourceName).toBe('Test Source');
    expect(state.symbols).toEqual([{ symbol: 'TEST', exchange: 'TESTEX', assetType: 'futures' }]);
    expect(useBacktestStore.getState().rawData).toHaveLength(1);

    onCandle?.({ time: 1060, open: 11, high: 13, low: 10, close: 12, volume: 6 });
    expect(useBacktestStore.getState().rawData.at(-1)?.close).toBe(12);
  });

  it('closes the active subscription and connection', async () => {
    await useMarketDataStore.getState().connectSource('test-source');
    useMarketDataStore.getState().disconnectSource();

    expect(closeSubscription).toHaveBeenCalledOnce();
    expect(closeConnection).toHaveBeenCalledOnce();
    expect(useMarketDataStore.getState().isConnected).toBe(false);
  });

  it('forwards provider connection options', async () => {
    let receivedOptions: unknown;
    registerMarketDataSource({
      id: 'options-source',
      name: 'Options Source',
      connect: async options => {
        receivedOptions = options;
        return connection;
      }
    });

    await useMarketDataStore.getState().connectSource('options-source', {
      credentials: { username: 'test-user', password: 'test-password' }
    });

    expect(receivedOptions).toEqual({
      credentials: { username: 'test-user', password: 'test-password' }
    });
  });
});
