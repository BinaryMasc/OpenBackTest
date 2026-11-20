import { useEffect, useRef } from 'react';
import type { Chart } from 'klinecharts';
import { CANDLE_PANE_ID } from '../lib/chart/constants';
import { DAY_SEPARATOR_INDICATOR_NAME } from '../lib/chart/indicators/daySeparators';
import { useChartStyleStore } from '../store/useChartStyleStore';

/** Keeps the day-separator indicator on the candle pane in sync with settings. */
export function useDaySeparators(chartRef: React.RefObject<Chart | null>, chartReady: boolean): void {
  const settings = useChartStyleStore(state => state.daySeparator);
  const createdRef = useRef(false);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) {
      createdRef.current = false;
      return;
    }

    if (!settings.enabled) {
      if (createdRef.current) chart.removeIndicator(CANDLE_PANE_ID, DAY_SEPARATOR_INDICATOR_NAME);
      createdRef.current = false;
      return;
    }

    if (createdRef.current) {
      chart.overrideIndicator({ name: DAY_SEPARATOR_INDICATOR_NAME, extendData: settings }, CANDLE_PANE_ID);
    } else {
      chart.createIndicator({ name: DAY_SEPARATOR_INDICATOR_NAME, extendData: settings }, true, { id: CANDLE_PANE_ID });
      createdRef.current = true;
    }
  }, [chartRef, chartReady, settings]);
}
