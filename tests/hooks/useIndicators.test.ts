import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chart } from 'klinecharts';
import { useIndicators } from '../../src/hooks/useIndicators';
import { useChartStateStore } from '../../src/store/useChartStateStore';

vi.mock('klinecharts', () => ({
  LineType: { Solid: 'solid' }
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
      overrideIndicator: vi.fn()
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
});
