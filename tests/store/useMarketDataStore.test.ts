import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candle } from '../../src/types';
import type { MarketDataConnection } from '../../src/services/marketData';
import { registerMarketDataSource } from '../../src/services/marketDataRegistry';
import { RITHMIC_DATA_STALE_AFTER_MS, useMarketDataStore } from '../../src/store/useMarketDataStore';
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

  afterEach(() => {
    useMarketDataStore.getState().disconnectSource();
    vi.useRealTimers();
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

    expect(receivedOptions).toEqual(expect.objectContaining({
      credentials: { username: 'test-user', password: 'test-password' },
      signal: expect.any(AbortSignal)
    }));
  });

  it('aborts pending connection attempts when reconnecting or disconnecting', async () => {
    const signals: AbortSignal[] = [];
    registerMarketDataSource({
      id: 'pending-source',
      name: 'Pending Source',
      connect: options => new Promise<MarketDataConnection>((_resolve, reject) => {
        const signal = options?.signal;
        if (!signal) throw new Error('Expected the store to provide a connection signal');
        signals.push(signal);
        signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })), { once: true });
      })
    });

    const firstAttempt = useMarketDataStore.getState().connectSource('pending-source');
    expect(signals).toHaveLength(1);

    const secondAttempt = useMarketDataStore.getState().connectSource('pending-source');
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);

    useMarketDataStore.getState().disconnectSource();
    expect(signals[1].aborted).toBe(true);

    await Promise.all([firstAttempt, secondAttempt]);
    expect(useMarketDataStore.getState().isConnected).toBe(false);
    expect(useMarketDataStore.getState().isLoading).toBe(false);
  });

  it('closes a connection that resolves after its attempt was cancelled', async () => {
    let resolveConnection: ((connection: MarketDataConnection) => void) | undefined;
    let receivedSignal: AbortSignal | undefined;
    const lateClose = vi.fn();
    const lateConnection: MarketDataConnection = {
      ...connection,
      sourceId: 'late-source',
      sourceName: 'Late Source',
      close: lateClose
    };
    registerMarketDataSource({
      id: 'late-source',
      name: 'Late Source',
      connect: options => new Promise<MarketDataConnection>(resolve => {
        receivedSignal = options?.signal;
        resolveConnection = resolve;
      })
    });

    const attempt = useMarketDataStore.getState().connectSource('late-source');
    expect(receivedSignal?.aborted).toBe(false);

    useMarketDataStore.getState().disconnectSource();
    expect(receivedSignal?.aborted).toBe(true);
    resolveConnection?.(lateConnection);

    await attempt;
    expect(lateClose).toHaveBeenCalledOnce();
    expect(useMarketDataStore.getState().connectionRef).toBeNull();
    expect(useMarketDataStore.getState().isConnected).toBe(false);
  });

  it('marks Rithmic data stale when no candle arrives within the warning window', async () => {
    vi.useFakeTimers();
    let statusHandler: ((status: 'connected' | 'disconnected') => void) | undefined;
    const rithmicLikeConnection: MarketDataConnection = {
      ...connection,
      sourceId: 'rithmic',
      sourceName: 'Rithmic',
      subscribeStatus: handler => {
        statusHandler = handler;
        return { close: vi.fn() };
      }
    };
    registerMarketDataSource({
      id: 'rithmic',
      name: 'Rithmic',
      connect: async () => rithmicLikeConnection
    });

    await useMarketDataStore.getState().connectSource('rithmic');
    expect(useMarketDataStore.getState().isDataStale).toBe(false);

    await vi.advanceTimersByTimeAsync(RITHMIC_DATA_STALE_AFTER_MS + 1000);
    expect(useMarketDataStore.getState().isDataStale).toBe(true);

    statusHandler?.('disconnected');
    expect(useMarketDataStore.getState().isConnectionLost).toBe(true);
    expect(useMarketDataStore.getState().isConnected).toBe(false);
  });
});
