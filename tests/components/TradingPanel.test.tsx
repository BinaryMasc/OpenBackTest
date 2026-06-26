import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TradingPanel } from '../../src/components/TradingPanel';
import { useTradeStore } from '../../src/store/useTradeStore';
import { useBacktestStore } from '../../src/store/useBacktestStore';

// Mock the Zustand stores
vi.mock('../../src/store/useTradeStore');
vi.mock('../../src/store/useBacktestStore');

describe('TradingPanel', () => {
  beforeEach(() => {
    // Basic mock implementations for the stores
    (useTradeStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      balance: 10000,
      realizedPnL: 0,
      unrealizedPnL: 0,
      position: 'flat',
      entryPrice: null,
      activePositionSize: 0,
      orderSize: 1,
      takeProfit: null,
      stopLoss: null,
      leverage: 10,
      initialBalance: 10000,
      contractSize: 1,
      feePercent: 0,
      isBlown: false,
      hasTraded: false,
      buy: vi.fn(),
      sell: vi.fn(),
      flat: vi.fn(),
      updateUnrealizedPnL: vi.fn(),
      setOrderSize: vi.fn(),
      setTakeProfit: vi.fn(),
      setStopLoss: vi.fn(),
      setLeverage: vi.fn(),
      setInitialBalance: vi.fn(),
      setContractSize: vi.fn(),
      setFeePercent: vi.fn(),
      reset: vi.fn(),
      finishSimulation: vi.fn(),
      isFinished: false,
      setShowStatsModal: vi.fn(),
    });

    (useBacktestStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      rawData: [{ time: 1000, close: 50000 }],
      currentIndex: 0,
    });
  });

  it('renders correctly and shows initial balance', () => {
    render(<TradingPanel />);
    expect(screen.getByText('Account Configuration')).toBeInTheDocument();
    // 10000 -> $10,000.00
    expect(screen.getByText('$10,000.00')).toBeInTheDocument();
  });
  
  it('displays the buy and sell buttons', () => {
    render(<TradingPanel />);
    expect(screen.getByText('Buy (Long)')).toBeInTheDocument();
    expect(screen.getByText('Sell (Short)')).toBeInTheDocument();
    expect(screen.getByText('Flat Position')).toBeInTheDocument();
  });
});
