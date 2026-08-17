import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBacktestStore } from '../../src/store/useBacktestStore';
import { useTradeStore } from '../../src/store/useTradeStore';

function resetSimulation() {
  useBacktestStore.setState({
    rawData: [],
    symbol: 'BTCUSDT',
    currentIndex: -1,
    isPlaying: false,
  });
  useTradeStore.getState().setInitialBalance(10000);
  useTradeStore.getState().reset();
  useTradeStore.getState().setFeePercent(0);
  useTradeStore.getState().setContractSize(1);
  useTradeStore.getState().setLeverage(150);
  vi.spyOn(useBacktestStore.getState(), 'getCurrentTickTime').mockReturnValue(1234);
}

describe('trade simulation scenarios', () => {
  beforeEach(resetSimulation);
  afterEach(() => vi.restoreAllMocks());

  it('averages, partially closes, and fully closes a long with complete statistics', () => {
    useTradeStore.getState().setOrderSize(2);
    useTradeStore.getState().buy(100);
    useTradeStore.getState().setOrderSize(1);
    useTradeStore.getState().buy(110);

    expect(useTradeStore.getState().entryPrice).toBeCloseTo(310 / 3);
    expect(useTradeStore.getState().activePositionSize).toBe(3);

    useTradeStore.getState().sell(120);
    expect(useTradeStore.getState().activePositionSize).toBe(2);
    expect(useTradeStore.getState().realizedPnL).toBeCloseTo(50 / 3);

    useTradeStore.getState().setOrderSize(2);
    useTradeStore.getState().sell(130);
    const state = useTradeStore.getState();
    expect(state.position).toBe('flat');
    expect(state.balance).toBeCloseTo(10070);
    expect(state.realizedPnL).toBeCloseTo(70);
    expect(state.finishedPositions[0]).toMatchObject({
      type: 'long',
      entryPrice: 310 / 3,
      exitPrice: 380 / 3,
      quantity: 3,
    });
    expect(state.finishedPositions[0].pnl).toBeCloseTo(70);
  });

  it('averages, partially closes, and fully closes a short with complete statistics', () => {
    useTradeStore.getState().setOrderSize(2);
    useTradeStore.getState().sell(200);
    useTradeStore.getState().setOrderSize(1);
    useTradeStore.getState().sell(190);

    expect(useTradeStore.getState().entryPrice).toBeCloseTo(590 / 3);
    expect(useTradeStore.getState().activePositionSize).toBe(3);

    useTradeStore.getState().buy(180);
    expect(useTradeStore.getState().activePositionSize).toBe(2);
    expect(useTradeStore.getState().realizedPnL).toBeCloseTo(50 / 3);

    useTradeStore.getState().setOrderSize(2);
    useTradeStore.getState().buy(170);
    const state = useTradeStore.getState();
    expect(state.position).toBe('flat');
    expect(state.balance).toBeCloseTo(10070);
    expect(state.realizedPnL).toBeCloseTo(70);
    expect(state.finishedPositions[0]).toMatchObject({
      type: 'short',
      entryPrice: 590 / 3,
      exitPrice: 520 / 3,
      quantity: 3,
    });
    expect(state.finishedPositions[0].pnl).toBeCloseTo(70);
  });

  it('closes long and short positions at take-profit and stop-loss levels', () => {
    useTradeStore.getState().buy(100);
    useTradeStore.getState().setTakeProfit(110);
    useTradeStore.getState().updateUnrealizedPnL(111);
    expect(useTradeStore.getState()).toMatchObject({ position: 'flat', unrealizedPnL: 0, takeProfit: null });
    expect(useTradeStore.getState().finishedPositions[0].exitPrice).toBe(110);

    useTradeStore.getState().reset();
    useTradeStore.getState().sell(100);
    useTradeStore.getState().setStopLoss(110);
    useTradeStore.getState().updateUnrealizedPnL(111);
    expect(useTradeStore.getState()).toMatchObject({ position: 'flat', unrealizedPnL: 0, stopLoss: null });
    expect(useTradeStore.getState().finishedPositions[0].exitPrice).toBe(110);
    expect(useTradeStore.getState().realizedPnL).toBe(-10);
  });

  it('rejects over-leveraged and cross-symbol orders and ignores blown accounts', () => {
    useTradeStore.getState().setLeverage(0.01);
    useTradeStore.getState().setOrderSize(2);
    useTradeStore.getState().buy(100);
    expect(useTradeStore.getState().position).toBe('flat');

    useTradeStore.getState().setLeverage(150);
    useTradeStore.getState().setOrderSize(1);
    useTradeStore.getState().buy(100);
    useBacktestStore.setState({ symbol: 'ETHUSDT' });
    useTradeStore.getState().sell(120);
    expect(useTradeStore.getState().position).toBe('long');
    expect(useTradeStore.getState().activePositionSize).toBe(1);

    useTradeStore.setState({ isBlown: true });
    useTradeStore.getState().buy(90);
    useTradeStore.getState().sell(90);
    expect(useTradeStore.getState().activePositionSize).toBe(1);
  });

  it('supports settings, history controls, and deterministic finish behavior', () => {
    useTradeStore.getState().setShowTradeHistory(true);
    useTradeStore.getState().setShowStatsModal(true);
    useTradeStore.getState().setMarginBlowoutPercent(10);
    useTradeStore.getState().setOrderSize(3);
    useTradeStore.getState().setStopLoss(90);
    useTradeStore.getState().setTakeProfit(120);
    expect(useTradeStore.getState()).toMatchObject({
      showTradeHistory: true,
      showStatsModal: true,
      marginBlowoutPercent: 10,
      orderSize: 3,
      stopLoss: 90,
      takeProfit: 120,
    });

    useTradeStore.setState({ tradeHistory: [{
      id: 'history', type: 'buy', price: 100, time: 1234, quantity: 1,
      fee: 0, realizedPnL: 0, positionSize: 1, entryPrice: null, balance: 10000
    }] });
    useTradeStore.getState().clearTradeHistory();
    expect(useTradeStore.getState().tradeHistory).toEqual([]);

    useBacktestStore.setState({
      rawData: [{ time: 1234, open: 100, high: 110, low: 90, close: 105, volume: 1 }],
      currentIndex: 0,
      isPlaying: true,
    });
    useTradeStore.getState().buy(100);
    useTradeStore.getState().finishSimulation();
    expect(useTradeStore.getState()).toMatchObject({ isFinished: true, showStatsModal: true, position: 'flat' });
    expect(useBacktestStore.getState().isPlaying).toBe(false);

    const finishedPositions = useTradeStore.getState().finishedPositions;
    useTradeStore.getState().finishSimulation();
    expect(useTradeStore.getState().finishedPositions).toEqual(finishedPositions);
  });
});
