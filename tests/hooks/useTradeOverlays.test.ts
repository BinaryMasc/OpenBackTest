import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chart } from 'klinecharts';
import { useTradeOverlays } from '../../src/hooks/useTradeOverlays';
import { useTradeStore } from '../../src/store/useTradeStore';

describe('useTradeOverlays', () => {
  let chart: {
    getOverlayById: ReturnType<typeof vi.fn>;
    createOverlay: ReturnType<typeof vi.fn>;
    overrideOverlay: ReturnType<typeof vi.fn>;
    removeOverlay: ReturnType<typeof vi.fn>;
  };
  let chartRef: { current: Chart };

  beforeEach(() => {
    useTradeStore.getState().reset();
    useTradeStore.setState({ showTradeHistory: false });
    chart = {
      getOverlayById: vi.fn().mockReturnValue(undefined),
      createOverlay: vi.fn(),
      overrideOverlay: vi.fn(),
      removeOverlay: vi.fn(),
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
      extendData: { text: ' 2 @ 100.00 | PnL: +12.50', color: '#008a63ff' },
      points: [{ value: 100 }]
    });
    expect(overlays[1].extendData).toBe('TP: 120.00 (+40.00)');
    expect(overlays[2].extendData).toBe('SL: 90.00 (-20.00)');
    expect(overlays[3]).toMatchObject({
      id: 'trade_trade-1',
      groupId: 'trade_history_group',
      extendData: 'buy',
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
});
