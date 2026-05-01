import { useRef, useEffect } from 'react';
import { init, dispose, type Chart } from 'klinecharts';
import type { Candle, Timeframe } from '../types';
import { CHART_CONTAINER_ID } from '../lib/chart/constants';
import { registerCustomOverlays } from '../lib/chart/overlays';

interface UseChartOptions {
  aggregatedData: Candle[];
  timeframe: Timeframe;
}

export function useChart({ aggregatedData, timeframe }: UseChartOptions) {
  const chartRef = useRef<Chart | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevTimeframeRef = useRef(timeframe);
  const prevDataLengthRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    registerCustomOverlays();
    const chart = init(CHART_CONTAINER_ID);
    if (chart) {
      chartRef.current = chart;
      chart.setStyles('dark');
    }
    return () => {
      dispose(CHART_CONTAINER_ID);
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || aggregatedData.length === 0) return;

    const chartData = aggregatedData.map(d => ({
      timestamp: d.time * 1000,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume || 0,
    }));

    const dataList = chartRef.current.getDataList();
    const isNewTimeframe = timeframe !== prevTimeframeRef.current;

    if (
      dataList.length === 0 ||
      isNewTimeframe ||
      Math.abs(chartData.length - prevDataLengthRef.current) > 1
    ) {
      chartRef.current.applyNewData(chartData);
      if (isNewTimeframe) chartRef.current.resize();
    } else {
      chartRef.current.updateData(chartData[chartData.length - 1]);
    }

    prevTimeframeRef.current = timeframe;
    prevDataLengthRef.current = chartData.length;
  }, [aggregatedData, timeframe]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      chartRef.current?.resize();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return { chartRef, containerRef };
}
