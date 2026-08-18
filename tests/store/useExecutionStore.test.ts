import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExecutionAccountState,
  ExecutionConnection,
  OrderRequest,
  OrderUpdate
} from '../../src/services/execution';
import type { MarketDataConnection } from '../../src/services/marketData';
import { registerMarketDataSource } from '../../src/services/marketDataRegistry';
import { useBacktestStore } from '../../src/store/useBacktestStore';
import { useExecutionStore } from '../../src/store/useExecutionStore';
import { useMarketDataStore } from '../../src/store/useMarketDataStore';

describe('useExecutionStore', () => {
  const brokerPlaceOrder = vi.fn<(order: OrderRequest) => Promise<OrderUpdate>>();
  const closeConnection = vi.fn();
  let accountUpdate: ((state: ExecutionAccountState) => void) | undefined;

  const accountState: ExecutionAccountState = {
    account: { id: 'paper-1', displayName: 'Paper Account' },
    balance: 10000,
    equity: 10125,
    realizedPnL: 100,
    unrealizedPnL: 25,
    positions: [],
    orders: [],
    statistics: { dailyPnL: 125, openPositions: 0, workingOrders: 0, updatedAt: 1000 },
    updatedAt: 1000
  };

  const execution: ExecutionConnection = {
    sourceId: 'execution-test-source',
    sourceName: 'Execution Test Source',
    listAccounts: vi.fn(async () => [{ id: 'paper-1', displayName: 'Paper Account' }]),
    getAccountState: vi.fn(async () => accountState),
    subscribeAccountState: vi.fn((_accountId, callback) => {
      accountUpdate = callback;
      return { close: vi.fn() };
    }),
    subscribeOrderUpdates: vi.fn(() => ({ close: vi.fn() })),
    subscribeFills: vi.fn(() => ({ close: vi.fn() })),
    placeOrder: brokerPlaceOrder,
    cancelOrder: vi.fn(async () => ({
      orderId: 'order-1', symbol: 'TEST', side: 'buy', quantity: 1, orderType: 'market', status: 'cancelled', filledQuantity: 0
    })),
    cancelAll: vi.fn(async () => undefined),
    flatten: vi.fn(async () => undefined),
    close: closeConnection
  };

  const marketConnection: MarketDataConnection = {
    sourceId: 'execution-test-source',
    sourceName: 'Execution Test Source',
    listSymbols: async () => [{ symbol: 'TEST', exchange: 'TESTEX', assetType: 'futures' }],
    fetchHistoricalCandles: async () => [{ time: 1000, open: 10, high: 12, low: 9, close: 11, volume: 5 }],
    subscribeCandles: () => ({ close: vi.fn() }),
    getExecutionConnection: () => execution,
    close: closeConnection
  };

  beforeEach(() => {
    useExecutionStore.getState().disconnect();
    useMarketDataStore.getState().disconnectSource();
    useBacktestStore.setState({ rawData: [], symbol: '', currentIndex: -1 });
    brokerPlaceOrder.mockReset();
    brokerPlaceOrder.mockResolvedValue({
      orderId: 'order-1',
      accountId: 'paper-1',
      symbol: 'TEST',
      side: 'buy',
      quantity: 2,
      orderType: 'market',
      status: 'working',
      filledQuantity: 0
    });
    accountUpdate = undefined;
    registerMarketDataSource({
      id: 'execution-test-source',
      name: 'Execution Test Source',
      connect: async () => marketConnection
    });
  });

  it('loads broker account data through the market connection without changing simulation state', async () => {
    await useMarketDataStore.getState().connectSource('execution-test-source');
    await useExecutionStore.getState().connect();

    expect(useExecutionStore.getState().selectedAccountId).toBe('paper-1');
    expect(useExecutionStore.getState().accountState?.equity).toBe(10125);
    expect(useBacktestStore.getState().symbol).toBe('TEST');
  });

  it('adds the selected account context to routed orders', async () => {
    await useMarketDataStore.getState().connectSource('execution-test-source');
    await useExecutionStore.getState().connect();
    await useExecutionStore.getState().placeOrder({ symbol: 'TEST', side: 'buy', quantity: 2, orderType: 'market' });

    expect(brokerPlaceOrder).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'paper-1',
      symbol: 'TEST',
      side: 'buy',
      quantity: 2,
      orderType: 'market'
    }));
    expect(useExecutionStore.getState().accountState?.orders[0].orderId).toBe('order-1');
  });

  it('accepts streamed account updates for the selected account', async () => {
    await useMarketDataStore.getState().connectSource('execution-test-source');
    await useExecutionStore.getState().connect();

    accountUpdate?.({ ...accountState, equity: 10300, updatedAt: 2000 });

    expect(useExecutionStore.getState().accountState?.equity).toBe(10300);
  });
});
