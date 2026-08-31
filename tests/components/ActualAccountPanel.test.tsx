import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ExecutionAccountState } from '../../src/services/execution';

const { backtestStoreHook, executionStoreHook, marketDataStoreHook } = vi.hoisted(() => ({
  backtestStoreHook: vi.fn(),
  executionStoreHook: vi.fn(),
  marketDataStoreHook: vi.fn()
}));

vi.mock('../../src/store/useBacktestStore', () => ({ useBacktestStore: backtestStoreHook }));
vi.mock('../../src/store/useMarketDataStore', () => ({ useMarketDataStore: marketDataStoreHook }));
vi.mock('../../src/store/useExecutionStore', () => ({ useExecutionStore: executionStoreHook }));

import { ActualAccountPanel } from '../../src/components/ActualAccountPanel';

describe('LiveAccountPanel', () => {
  const accountState: ExecutionAccountState = {
    account: { id: 'paper-1', displayName: 'Paper Account' },
    balance: 10000,
    equity: 10125,
    realizedPnL: 100,
    unrealizedPnL: 25,
    buyingPower: 50000,
    marginUsed: 1000,
    positions: [{ symbol: 'TEST', side: 'long', quantity: 2, averagePrice: 10, unrealizedPnL: 25 }],
    orders: [],
    statistics: { dailyPnL: 125, openPositions: 1, workingOrders: 0, updatedAt: 1000 },
    updatedAt: 1000
  };

  beforeEach(() => {
    const executionState = {
      connection: { sourceId: 'rithmic' },
      accounts: [{ id: 'paper-1', displayName: 'Paper Account' }],
      selectedAccountId: 'paper-1',
      accountState,
      isLoading: false,
      isSubmitting: false,
      error: null,
      connect: vi.fn(async () => undefined),
      selectAccount: vi.fn(async () => undefined),
      placeOrder: vi.fn(async () => null),
      flatten: vi.fn(async () => undefined),
      disconnect: vi.fn()
    };
    const backtestState = { symbol: 'TEST', rawData: [], currentIndex: -1 };
    const marketDataState = { connectionRef: { sourceId: 'rithmic' }, isConnected: true };

    executionStoreHook.mockImplementation((selector?: (state: typeof executionState) => unknown) => selector ? selector(executionState) : executionState);
    executionStoreHook.getState = vi.fn(() => executionState);
    backtestStoreHook.mockImplementation((selector: (state: typeof backtestState) => unknown) => selector(backtestState));
    marketDataStoreHook.mockImplementation((selector: (state: typeof marketDataState) => unknown) => selector(marketDataState));
  });

  it('renders live account statistics and execution controls', () => {
    render(<ActualAccountPanel />);

    expect(screen.getByText('Live Account')).toBeInTheDocument();
    // expect(screen.getByText('Live Account Statistics')).toBeInTheDocument();
    expect(screen.getByText('Buy Market')).toBeInTheDocument();
    expect(screen.getByText('Sell Market')).toBeInTheDocument();
    expect(screen.getByText('Flatten Account')).toBeInTheDocument();
  });

  it('keeps account information in a separate expandable section', () => {
    render(<ActualAccountPanel />);

    const accountInfoButton = screen.getByRole('button', { name: 'Account Information' });
    expect(screen.queryByText('$10,125.00')).not.toBeInTheDocument();

    fireEvent.click(accountInfoButton);

  });
});
