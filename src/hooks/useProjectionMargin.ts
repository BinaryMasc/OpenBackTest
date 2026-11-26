import { useEffect, type RefObject } from 'react';
import { ActionType, type Chart } from 'klinecharts';
import type { Timeframe } from '../types';
import type { IndicatorInstance } from '../types/indicatorTypes';
import { getCustomIndicator } from '../lib/chart/customIndicators';

export function useProjectionMargin(chartRef: RefObject<Chart | null>, instances: IndicatorInstance[], timeframe: Timeframe) {
  let bars = 0;
  let pixels = 0;
  for (const instance of instances) {
    if (!instance.visible) continue;
    const margin = getCustomIndicator(instance.name)?.rightMargin?.(instance.calcParams, timeframe);
    if (margin) {
      bars = Math.max(bars, margin.bars);
      pixels = Math.max(pixels, margin.pixels);
    }
  }

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !bars) return;
    const previous = chart.getOffsetRightDistance();
    const apply = () => chart.setOffsetRightDistance(Math.max(previous, bars * chart.getBarSpace() + pixels));
    const onZoom = () => {
      if (chart.getVisibleRange().to >= chart.getDataList().length) apply();
    };
    apply();
    chart.subscribeAction(ActionType.OnZoom, onZoom);
    return () => {
      chart.unsubscribeAction(ActionType.OnZoom, onZoom);
      chart.setOffsetRightDistance(previous);
    };
  }, [chartRef, bars, pixels]);
}
