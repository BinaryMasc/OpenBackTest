import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chart } from 'klinecharts';
import { useIndicators } from '../../src/hooks/useIndicators';
import { useChartStateStore } from '../../src/store/useChartStateStore';

vi.mock('klinecharts', () => ({
  LineType: { Solid: 'solid' },
  IndicatorSeries: { Normal: 'normal' }
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
      { name: 'AVWAP', calcParams: [1000, 2000] },
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
});
