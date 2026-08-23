import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chart } from 'klinecharts';
import type { ExecutionAccountState } from '../../src/services/execution';
import { findContainingCandleIndex, useTradeOverlays } from '../../src/hooks/useTradeOverlays';
import { useBacktestStore } from '../../src/store/useBacktestStore';
import { useExecutionStore } from '../../src/store/useExecutionStore';
import { useMarketDataStore } from '../../src/store/useMarketDataStore';
import { useTradeStore } from '../../src/store/useTradeStore';
import { useChartStateStore } from '../../src/store/useChartStateStore';

describe('useTradeOverlays', () => {
  let chart: {
    getOverlayById: ReturnType<typeof vi.fn>;
    createOverlay: ReturnType<typeof vi.fn>;
    overrideOverlay: ReturnType<typeof vi.fn>;
    removeOverlay: ReturnType<typeof vi.fn>;
    getDataList: ReturnType<typeof vi.fn>;
  };
  let chartRef: { current: Chart };

  beforeEach(() => {
    useTradeStore.getState().reset();
    useTradeStore.setState({ showTradeHistory: false, contractSize: 1 });
    useBacktestStore.setState({ mode: 'playback', symbol: '', rawData: [], currentIndex: -1 });
    useMarketDataStore.setState({ symbols: [] });
    useExecutionStore.setState({ accountState: null });
    useChartStateStore.setState({ bySymbol: {}, indicators: {} });
    chart = {
      getOverlayById: vi.fn().mockReturnValue(undefined),
      createOverlay: vi.fn(),
      overrideOverlay: vi.fn(),
      removeOverlay: vi.fn(),
      getDataList: vi.fn().mockReturnValue([]),
    };
    chartRef = { current: chart as unknown as Chart };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('removes position, target, stop, and history overlays when flat', () => {
    renderHook(() => useTradeOverlays(chartRef));

    expect(chart.createOverlay).not.toHaveBeenCalled();
    expect(chart.removeOverlay).toHaveBeenCalledWith({ id: 'positionLine_overlay' });
    expect(chart.removeOverlay).toHaveBeenCalledWith({ id: 'tpLine_overlay' });
    expect(chart.removeOverlay).toHaveBeenCalledWith({ id: 'slLine_overlay' });
    expect(chart.removeOverlay).toHaveBeenCalledWith({ groupId: 'trade_history_group' });
  });

  it('creates position, TP, SL, and trade-history overlays for an active long', () => {
    useTradeStore.setState({
      position: 'long',
      entryPrice: 100,
      activePositionSize: 2,
      unrealizedPnL: 12.5,
      takeProfit: 120,
      stopLoss: 90,
      showTradeHistory: true,
      tradeHistory: [{
        id: 'trade-1', type: 'buy', price: 100, time: 1000, quantity: 2,
        fee: 0, realizedPnL: 0, positionSize: 2, entryPrice: null, balance: 10000
      }]
    });

    renderHook(() => useTradeOverlays(chartRef));

    const overlays = chart.createOverlay.mock.calls.map(([overlay]) => overlay);
    expect(overlays.map(overlay => overlay.name)).toEqual(['positionLine', 'tpLine', 'slLine', 'tradeArrow']);
    expect(overlays[0]).toMatchObject({
      id: 'positionLine_overlay',
      extendData: { text: ' 2 @ 100.00 | PnL: +12.50', color: '#2DC08E' },
      points: [{ value: 100 }]
    });
    expect(overlays[1].extendData).toBe('TP: 120.00 (+40.00)');
    expect(overlays[2].extendData).toBe('SL: 90.00 (-20.00)');
    expect(overlays[3]).toMatchObject({
      id: 'trade_trade-1',
      groupId: 'trade_history_group',
      extendData: { type: 'buy', color: '#ffffff' },
      points: [{ timestamp: 1000000, value: 100 }]
    });
  });

  it('overrides existing overlays and updates TP from drag callbacks', () => {
    chart.getOverlayById.mockReturnValue({ id: 'existing' });
    useTradeStore.setState({
      position: 'short',
      entryPrice: 200,
      activePositionSize: 1,
      unrealizedPnL: -4,
      takeProfit: 180,
      stopLoss: 220,
    });

    renderHook(() => useTradeOverlays(chartRef));
    const tpOverlay = chart.overrideOverlay.mock.calls
      .map(([overlay]) => overlay)
      .find(overlay => overlay.id === 'tpLine_overlay');
    expect(tpOverlay).toBeDefined();
    expect(tpOverlay.extendData).toBe('TP: 180.00 (+20.00)');

    act(() => {
      tpOverlay.onPressedMoving({ overlay: { id: 'tpLine_overlay', points: [{ value: 185 }] } });
    });
    expect(chart.overrideOverlay).toHaveBeenCalledWith({
      id: 'tpLine_overlay',
      extendData: 'TP: 185.00 (+15.00)'
    });

    act(() => {
      tpOverlay.onPressedMoveEnd({ overlay: { id: 'tpLine_overlay', points: [{ value: 185 }] } });
    });
    expect(useTradeStore.getState().takeProfit).toBe(185);
  });

  it('removes history overlays when history display is disabled', () => {
    useTradeStore.setState({ showTradeHistory: false });
    renderHook(() => useTradeOverlays(chartRef));
    expect(chart.removeOverlay).toHaveBeenCalledWith({ groupId: 'trade_history_group' });
  });

  it('maps an intrabar trade to the containing candle instead of the previous timestamp match', () => {
    expect(findContainingCandleIndex([
      { timestamp: 0 },
      { timestamp: 300_000 },
      { timestamp: 600_000 },
    ], 240_000)).toBe(0);

    chart.getDataList = vi.fn().mockReturnValue([
      { timestamp: 0 },
      { timestamp: 300_000 },
      { timestamp: 600_000 },
    ]);
    useBacktestStore.setState({ symbol: 'TEST', rawData: [{ time: 240, open: 100, high: 110, low: 90, close: 105, volume: 1 }], currentIndex: 0 });
    useTradeStore.setState({
      showTradeHistory: true,
      tradeHistory: [{
        id: 'intrabar-trade', type: 'buy', price: 105, time: 240, quantity: 1,
        fee: 0, realizedPnL: 0, positionSize: 1, entryPrice: null, balance: 10000
      }]
    });

    renderHook(() => useTradeOverlays(chartRef));

    expect(chart.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .find(overlay => overlay.id === 'trade_intrabar-trade'))
      .toMatchObject({ points: [{ dataIndex: 0, value: 105 }] });
  });

  it('restores stored arrows only from the active simulation/live mode', () => {
    useBacktestStore.setState({ mode: 'live', symbol: 'TEST' });
    useTradeStore.setState({ showTradeHistory: true });
    useChartStateStore.getState().saveTrades('TEST', 'simulation', [{
      id: 'simulation-arrow', side: 'buy', price: 100, time: 1000
    }]);
    useChartStateStore.getState().saveTrades('TEST', 'live', [{
      id: 'live-arrow', side: 'sell', price: 110, time: 1060
    }]);

    renderHook(() => useTradeOverlays(chartRef));

    const overlays = chart.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .filter(overlay => overlay.groupId === 'trade_history_group');
    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({ id: 'trade_live-arrow', extendData: { type: 'sell' } });
  });

  it('renders live TP and SL orders on the chart', () => {
    const accountState: ExecutionAccountState = {
      account: { id: 'paper-1' },
      positions: [{ symbol: 'TEST', side: 'long', quantity: 1, averagePrice: 100 }],
      orders: [
        { orderId: 'tp-1', symbol: 'TEST', side: 'sell', quantity: 1, orderType: 'limit', limitPrice: 110, status: 'working', filledQuantity: 0 },
        { orderId: 'sl-1', symbol: 'TEST', side: 'sell', quantity: 1, orderType: 'stop', stopPrice: 90, status: 'working', filledQuantity: 0 },
      ],
      statistics: { openPositions: 1, workingOrders: 2, updatedAt: 1000 },
      updatedAt: 1000,
    };
    useBacktestStore.setState({
      mode: 'live',
      symbol: 'TEST',
      rawData: [{ time: 1000, open: 105, high: 105, low: 105, close: 105, volume: 1 }],
      currentIndex: 0,
    });
    useMarketDataStore.setState({ symbols: [{ symbol: 'TEST', contractSize: 50 }] });
    useExecutionStore.setState({ accountState });

    renderHook(() => useTradeOverlays(chartRef));

    const overlays = chart.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .filter(overlay => overlay.groupId === 'broker_trade_group');
    expect(overlays).toHaveLength(3);
    expect(overlays.find(overlay => overlay.id === 'broker_order_tp-1')).toMatchObject({
      name: 'tpLine',
      extendData: 'TP: 110 (+500.00)',
    });
    expect(overlays.find(overlay => overlay.id === 'broker_order_sl-1')).toMatchObject({
      name: 'slLine',
      extendData: 'SL: 90 (-500.00)',
    });
  });

  it('updates live position PnL from the latest chart price and contract multiplier', () => {
    const accountState: ExecutionAccountState = {
      account: { id: 'paper-1' },
      positions: [{ symbol: 'TEST', side: 'long', quantity: 2, averagePrice: 100 }],
      orders: [],
      statistics: { openPositions: 1, workingOrders: 0, updatedAt: 1000 },
      updatedAt: 1000,
    };
    useBacktestStore.setState({
      mode: 'live',
      symbol: 'TEST',
      rawData: [{ time: 1000, open: 102, high: 102, low: 102, close: 102, volume: 1 }],
      currentIndex: 0,
    });
    useMarketDataStore.setState({ symbols: [{ symbol: 'TEST', contractSize: 50 }] });
    useExecutionStore.setState({ accountState });

    renderHook(() => useTradeOverlays(chartRef));

    const latestPositionOverlay = () => chart.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .filter(overlay => overlay.id === 'broker_position_TEST')
      .at(-1);
    expect(latestPositionOverlay()).toMatchObject({
      extendData: { text: 'LONG 2 @ 100 | PnL: +200.00' },
    });

    act(() => {
      useBacktestStore.setState({
        rawData: [{ time: 1000, open: 97, high: 97, low: 97, close: 97, volume: 1 }],
      });
    });

    expect(latestPositionOverlay()).toMatchObject({
      extendData: { text: 'LONG 2 @ 100 | PnL: -300.00' },
    });
  });

  it('falls back to the configured contract size when live instrument metadata is unavailable', () => {
    const accountState: ExecutionAccountState = {
      account: { id: 'paper-1' },
      positions: [{ symbol: 'TEST', side: 'short', quantity: 2, averagePrice: 100 }],
      orders: [],
      statistics: { openPositions: 1, workingOrders: 0, updatedAt: 1000 },
      updatedAt: 1000,
    };
    useTradeStore.setState({ contractSize: 10 });
    useBacktestStore.setState({
      mode: 'live',
      symbol: 'TEST',
      rawData: [{ time: 1000, open: 98, high: 98, low: 98, close: 98, volume: 1 }],
      currentIndex: 0,
    });
    useExecutionStore.setState({ accountState });

    renderHook(() => useTradeOverlays(chartRef));

    expect(chart.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .find(overlay => overlay.id === 'broker_position_TEST'))
      .toMatchObject({
        extendData: { text: 'SHORT 2 @ 100 | PnL: +40.00' },
      });
  });

  it('uses an instrument point value when its contract size is unavailable', () => {
    const accountState: ExecutionAccountState = {
      account: { id: 'paper-1' },
      positions: [{ symbol: 'TEST', side: 'long', quantity: 2, averagePrice: 100 }],
      orders: [],
      statistics: { openPositions: 1, workingOrders: 0, updatedAt: 1000 },
      updatedAt: 1000,
    };
    useTradeStore.setState({ contractSize: 10 });
    useBacktestStore.setState({
      mode: 'live',
      symbol: 'TEST',
      rawData: [{ time: 1000, open: 102, high: 102, low: 102, close: 102, volume: 1 }],
      currentIndex: 0,
    });
    useMarketDataStore.setState({ symbols: [{ symbol: 'TEST', contractSize: 0, pointValue: 25 }] });
    useExecutionStore.setState({ accountState });

    renderHook(() => useTradeOverlays(chartRef));

    expect(chart.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .find(overlay => overlay.id === 'broker_position_TEST'))
      .toMatchObject({
        extendData: { text: 'LONG 2 @ 100 | PnL: +100.00' },
      });
  });
});
