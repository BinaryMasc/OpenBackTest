import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTradeStore } from '../../src/store/useTradeStore';
import { useBacktestStore } from '../../src/store/useBacktestStore';

describe('useTradeStore', () => {
  beforeEach(() => {
    useTradeStore.getState().reset();
    
    // Mock the backtest time so trades get a consistent timestamp
    vi.spyOn(useBacktestStore.getState(), 'getCurrentTickTime').mockReturnValue(1000000);
  });

  it('should initialize correctly', () => {
    const state = useTradeStore.getState();
    expect(state.position).toBe('flat');
    expect(state.balance).toBe(10000); // initial balance
    expect(state.isBlown).toBe(false);
  });

  it('should handle a simple buy (long) position', () => {
    // Set fee to 0.1% to test fee deduction
    useTradeStore.getState().setFeePercent(0.1);
    useTradeStore.getState().setOrderSize(1);
    useTradeStore.getState().setContractSize(1);
    
    const currentPrice = 50000;
    useTradeStore.getState().buy(currentPrice);

    const state = useTradeStore.getState();
    expect(state.position).toBe('long');
    expect(state.entryPrice).toBe(50000);
    expect(state.activePositionSize).toBe(1);
    
    // Fee = 1 * 50000 * 1 * (0.1/100) = 50
    expect(state.balance).toBe(10000 - 50);
    expect(state.hasTraded).toBe(true);
    expect(state.tradeHistory.length).toBe(1);
  });

  it('should calculate unrealized PnL correctly', () => {
    useTradeStore.getState().setFeePercent(0); // Simplify math
    useTradeStore.getState().setOrderSize(2);
    
    // Enter at 100
    useTradeStore.getState().buy(100);
    
    // Price moves to 150
    useTradeStore.getState().updateUnrealizedPnL(150);
    
    // (150 - 100) * 2 size * 1 contract = +100 profit
    expect(useTradeStore.getState().unrealizedPnL).toBe(100);
    
    // Price drops to 80
    useTradeStore.getState().updateUnrealizedPnL(80);
    
    // (80 - 100) * 2 = -40 loss
    expect(useTradeStore.getState().unrealizedPnL).toBe(-40);
  });

  it('should blow account if equity goes below zero', () => {
    useTradeStore.getState().setInitialBalance(100);
    useTradeStore.getState().reset(); // Apply new initial balance
    
    useTradeStore.getState().setOrderSize(10);
    useTradeStore.getState().buy(100);
    
    // Price drops drastically
    useTradeStore.getState().updateUnrealizedPnL(85);
    
    // (85 - 100) * 10 = -150 PnL. Equity: 100 - 150 = -50
    const state = useTradeStore.getState();
    expect(state.isBlown).toBe(true);
    expect(state.position).toBe('flat'); // Automatically closes
  });

  it('should restore state via importState', () => {
    useTradeStore.getState().importState({
      balance: 15000,
      position: 'short',
      entryPrice: 40000,
      activePositionSize: 5,
    });
    
    const state = useTradeStore.getState();
    expect(state.balance).toBe(15000);
    expect(state.position).toBe('short');
    expect(state.entryPrice).toBe(40000);
    expect(state.activePositionSize).toBe(5);
  });

  it('should handle flipping a position (long to short)', () => {
    useTradeStore.getState().setFeePercent(0);
    useTradeStore.getState().setContractSize(1);

    // Enter long 1 contract at 100
    useTradeStore.getState().setOrderSize(1);
    useTradeStore.getState().buy(100);
    
    // Now sell 3 contracts at 150. Should close 1 long (profit 50), open 2 short.
    useTradeStore.getState().setOrderSize(3);
    useTradeStore.getState().sell(150);

    const state = useTradeStore.getState();
    expect(state.position).toBe('short');
    expect(state.activePositionSize).toBe(2);
    expect(state.entryPrice).toBe(150);
    expect(state.realizedPnL).toBe(50); // (150 - 100) * 1
    expect(state.tradeHistory.length).toBe(3); // 1 buy, 1 close buy, 1 open sell
  });

  it('should not update unrealized PnL when flat', () => {
    useTradeStore.getState().reset(); // Ensure flat
    
    useTradeStore.getState().updateUnrealizedPnL(20000);
    
    const state = useTradeStore.getState();
    expect(state.unrealizedPnL).toBe(0);
  });

  it('should calculate final statistics on finishSimulation', () => {
    // We need mock data in useBacktestStore so finishSimulation can get the currentPrice to close
    useBacktestStore.setState({
      rawData: [{ time: 1000, open: 100, high: 120, low: 90, close: 150, volume: 10 }],
      currentIndex: 0
    });

    useTradeStore.getState().setFeePercent(0);
    useTradeStore.getState().setContractSize(1);
    useTradeStore.getState().setOrderSize(1);

    // Enter long at 100
    useTradeStore.getState().buy(100);

    // Finish simulation (which should close at the current rawData close price: 150)
    useTradeStore.getState().finishSimulation();

    const state = useTradeStore.getState();
    expect(state.isFinished).toBe(true);
    expect(state.showStatsModal).toBe(true);
    expect(state.position).toBe('flat');
    
    // Check if the finished position is correctly recorded
    expect(state.finishedPositions.length).toBe(1);
    const finishedPos = state.finishedPositions[0];
    expect(finishedPos.type).toBe('long');
    expect(finishedPos.entryPrice).toBe(100);
    expect(finishedPos.exitPrice).toBe(150);
    expect(finishedPos.pnl).toBe(50);
  });
});
