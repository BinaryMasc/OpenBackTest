import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chart } from 'klinecharts';
import { useIndicators } from '../../src/hooks/useIndicators';
import { useChartStateStore } from '../../src/store/useChartStateStore';

vi.mock('klinecharts', () => ({
  LineType: { Solid: 'solid' },
  IndicatorSeries: { Normal: 'normal' },
  registerIndicator: vi.fn(),
}));

describe('useIndicators persistence', () => {
  beforeEach(() => {
    useChartStateStore.setState({ bySymbol: {}, indicators: {} });
  });

  it('restores saved indicator instances for a chart', () => {
    const savedIndicator = {
      id: 'ema-20',
      name: 'EMA',
      calcParams: [20],
      color: '#38bdf8',
      opacity: 0.8,
      visible: true,
      paneId: 'candle_pane'
    };
    useChartStateStore.getState().saveIndicators('chart-1', [savedIndicator]);

    const chart = {
      removeIndicator: vi.fn(),
      createIndicator: vi.fn(),
      overrideIndicator: vi.fn(),
      overrideOverlay: vi.fn(),
      removeOverlay: vi.fn(),
      createOverlay: vi.fn(),
      getDataList: vi.fn(() => [
        { timestamp: 1000, close: 10 },
        { timestamp: 2000, close: 11 },
        { timestamp: 3000, close: 12 },
      ])
    } as unknown as Chart;

    const { result } = renderHook(() => useIndicators(
      { current: chart },
      { chartId: 'chart-1', chartReady: true, symbol: 'ESU6.CME' },
    ));

    expect(result.current.instances).toEqual([savedIndicator]);
    expect(chart.createIndicator).toHaveBeenCalledWith(
      { name: 'EMA', calcParams: [20] },
      true,
      { id: 'candle_pane' },
    );
  });

  it('creates a range-backed anchored VWAP from two selected timestamps', () => {
    const chart = {
      removeIndicator: vi.fn(),
      createIndicator: vi.fn(),
      overrideIndicator: vi.fn(),
      overrideOverlay: vi.fn(),
      removeOverlay: vi.fn(),
      createOverlay: vi.fn(),
      getDataList: vi.fn(() => [
        { timestamp: 1000, close: 10 },
        { timestamp: 2000, close: 11 },
        { timestamp: 3000, close: 12 },
      ])
    } as unknown as Chart;

    const { result } = renderHook(() => useIndicators(
      { current: chart },
      { chartId: 'chart-1', chartReady: true, symbol: 'ESU6.CME' },
    ));

    act(() => {
      result.current.addIndicator('AVWAP', {
        startTimestamp: 1000,
        endTimestamp: 2000,
        overlayId: 'range-1',
      });
    });

    expect(chart.createIndicator).toHaveBeenCalledWith(
      { name: expect.stringMatching(/^AVWAP_avwap_/), calcParams: [1000, 2000] },
      true,
      { id: 'candle_pane' },
    );
    expect(chart.overrideOverlay).toHaveBeenCalledWith(expect.objectContaining({ id: 'range-1' }));
    expect(result.current.instances[0]).toMatchObject({
      name: 'AVWAP',
      anchorStartTimestamp: 1000,
      anchorEndTimestamp: 2000,
      rangeOverlayId: 'range-1',
    });
  });

  it('keeps multiple anchored AVWAP and AVP instances independent', () => {
    const chart = {
      removeIndicator: vi.fn(),
      createIndicator: vi.fn(),
      overrideIndicator: vi.fn(),
      overrideOverlay: vi.fn(),
      removeOverlay: vi.fn(),
      createOverlay: vi.fn(),
      getDataList: vi.fn(() => [
        { timestamp: 1000, close: 10 },
        { timestamp: 2000, close: 11 },
        { timestamp: 3000, close: 12 },
      ])
    } as unknown as Chart;

    const { result } = renderHook(() => useIndicators(
      { current: chart },
      { chartId: 'chart-1', chartReady: true, symbol: 'ESU6.CME' },
    ));

    act(() => {
      result.current.addIndicator('AVWAP', { startTimestamp: 1000, endTimestamp: 2000, overlayId: 'vwap-1' });
    });
    act(() => {
      result.current.addIndicator('AVWAP', { startTimestamp: 2000, endTimestamp: 3000, overlayId: 'vwap-2' });
    });
    act(() => {
      result.current.addIndicator('AVP', { startTimestamp: 1000, endTimestamp: 2000, overlayId: 'vp-1' });
    });
    act(() => {
      result.current.addIndicator('AVP', { startTimestamp: 2000, endTimestamp: 3000, overlayId: 'vp-2' });
    });

    expect(result.current.instances).toHaveLength(4);
    const createdNames = chart.createIndicator.mock.calls.map(([indicator]) => indicator.name);
    expect(new Set(createdNames).size).toBe(4);

    const firstVwap = result.current.instances[0];
    const secondVwap = result.current.instances[1];
    act(() => result.current.updateAnchoredRange('vwap-1', 1000, 3000));

    expect(chart.overrideIndicator).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: `AVWAP_${firstVwap.id}`, calcParams: [1000, 3000] }),
      'candle_pane',
    );
    expect(secondVwap.calcParams).toEqual([2000, 3000]);

    act(() => result.current.removeIndicator(firstVwap.id));
    expect(chart.removeIndicator).toHaveBeenCalledWith('candle_pane', `AVWAP_${firstVwap.id}`);
    expect(result.current.instances.some(instance => instance.id === secondVwap.id)).toBe(true);
  });
});
