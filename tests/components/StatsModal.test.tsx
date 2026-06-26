import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatsModal } from '../../src/components/StatsModal';
import { useTradeStore } from '../../src/store/useTradeStore';

describe('StatsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTradeStore.getState().reset();
    useTradeStore.setState({ showStatsModal: false });
  });

  it('does not render when showStatsModal is false', () => {
    const { container } = render(<StatsModal />);
    expect(container.firstChild).toBeNull();
  });

  it('renders stats when showStatsModal is true', () => {
    useTradeStore.setState({
      showStatsModal: true,
      initialBalance: 10000,
      finishedPositions: [
        {
          type: 'long', entryPrice: 100, exitPrice: 150, quantity: 1, pnl: 50, openTime: 1000, closeTime: 2000,
          id: '',
          trades: []
        },
        {
          type: 'short', entryPrice: 100, exitPrice: 120, quantity: 1, pnl: -20, openTime: 3000, closeTime: 4000,
          id: '',
          trades: []
        }
      ],
      tradeHistory: [
        {
          time: 1000, type: 'buy', price: 100, quantity: 1, fee: 1, realizedPnL: 0, positionSize: 1, entryPrice: 100, balance: 9999,
          id: ''
        },
        {
          time: 2000, type: 'sell', price: 150, quantity: 1, fee: 1.5, realizedPnL: 50, positionSize: 0, entryPrice: null, balance: 10047.5,
          id: ''
        },
        {
          time: 3000, type: 'sell', price: 100, quantity: 1, fee: 1, realizedPnL: 0, positionSize: -1, entryPrice: 100, balance: 10046.5,
          id: ''
        },
        {
          time: 4000, type: 'buy', price: 120, quantity: 1, fee: 1.2, realizedPnL: -20, positionSize: 0, entryPrice: null, balance: 10025.3,
          id: ''
        }
      ]
    });

    render(<StatsModal />);

    // Wait for render
    expect(screen.getByText('Simulation Statistics')).toBeInTheDocument();

    // Net profit = 10025.3 - 10000 = 25.30
    expect(screen.getByText(/\$25\.30/i)).toBeInTheDocument(); // Net Profit

    // Win rate = 1 / 2 = 50%
    expect(screen.getByText(/50\.0%/i)).toBeInTheDocument();

    // Profit Factor = 50 / 20 = 2.50, RR = 50 / 20 = 2.50
    const twoFifties = screen.getAllByText(/2\.50/i);
    expect(twoFifties.length).toBe(2);

    // Time Metrics
    const timeElements = screen.getAllByText(/16m 40s/i);
    expect(timeElements.length).toBeGreaterThanOrEqual(1);

    // Trade Distribution PnL
    expect(screen.getByText(/\+\$50/i)).toBeInTheDocument(); // Long profit
    expect(screen.getAllByText(/-\$0/i).length).toBeGreaterThanOrEqual(1); // Long loss (or short profit with -)
    expect(screen.getAllByText(/\+\$0/i).length).toBeGreaterThanOrEqual(1); // Short profit
    expect(screen.getAllByText(/-\$20/i).length).toBeGreaterThanOrEqual(1); // Short loss and Avg loss

    // Percent Profitable Days
    expect(screen.getByText(/100\.0%/i)).toBeInTheDocument();
  });

  it('handles empty states without crashing', () => {
    useTradeStore.setState({
      showStatsModal: true,
      initialBalance: 10000,
      finishedPositions: [],
      tradeHistory: []
    });

    render(<StatsModal />);
    expect(screen.getByText('Simulation Statistics')).toBeInTheDocument();

    // Net profit, Gross Profit, etc are all $0.00
    const zeroElements = screen.getAllByText(/\$0\.00/i);
    expect(zeroElements.length).toBeGreaterThan(0);
  });

  it('closes when close button is clicked', () => {
    useTradeStore.setState({ showStatsModal: true });
    const spy = vi.spyOn(useTradeStore.getState(), 'setShowStatsModal');

    const { container } = render(<StatsModal />);
    // Find the X button by its specific class
    const closeButton = container.querySelector('.rounded-full');
    
    if (closeButton) {
      fireEvent.click(closeButton);
    }

    expect(spy).toHaveBeenCalledWith(false);
  });
});
