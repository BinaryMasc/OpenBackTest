import { useRef, useEffect } from 'react';
import { init, dispose, type Chart, TooltipShowRule } from 'klinecharts';
import type { Candle, Timeframe } from '../types';
import { CHART_CONTAINER_ID } from '../lib/chart/constants';
import { registerCustomOverlays } from '../lib/chart/overlays';
import { registerCustomIndicators } from '../lib/chart/customIndicators';
import { useChartStyleStore } from '../store/useChartStyleStore';

interface UseChartOptions {
  aggregatedData: Candle[];
  timeframe: Timeframe;
}

export function useChart({ aggregatedData, timeframe }: UseChartOptions) {
  const chartRef = useRef<Chart | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevTimeframeRef = useRef(timeframe);
  const prevDataLengthRef = useRef(0);

  const { upColor, downColor, upBorderColor, downBorderColor, upWickColor, downWickColor } = useChartStyleStore();

  useEffect(() => {
    if (!containerRef.current) return;
    registerCustomOverlays();
    registerCustomIndicators();
    const chart = init(CHART_CONTAINER_ID);
    let handleDblClick: ((e: MouseEvent) => void) | null = null;

    if (chart) {
      chartRef.current = chart;
      chart.setStyles('dark');
      
      const currentStyle = useChartStyleStore.getState();
      chart.setStyles({
        candle: {
          bar: {
            upColor: currentStyle.upColor,
            downColor: currentStyle.downColor,
            upBorderColor: currentStyle.upBorderColor,
            downBorderColor: currentStyle.downBorderColor,
            upWickColor: currentStyle.upWickColor,
            downWickColor: currentStyle.downWickColor,
          },
        },
        indicator: {
          tooltip: {
            showRule: TooltipShowRule.None,
          },
        },
      });

      const container = containerRef.current;
      handleDblClick = (e: MouseEvent) => {
        if (!chartRef.current) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const converted = chartRef.current.convertFromPixel(
          [{ x, y }],
          { paneId: 'candle_pane' }
        );

        const point = Array.isArray(converted) ? converted[0] : converted;
        if (!point || point.dataIndex === undefined || point.value === undefined) return;

        const dataList = chartRef.current.getDataList();
        const candle = dataList[point.dataIndex];
        if (!candle) return;

        // Verify the click is vertically within the candle's range with tolerance
        const candleHeight = Math.abs(candle.high - candle.low);
        const tolerance = Math.max(candleHeight * 0.25, (candle.high + candle.low) * 0.001);
        const minVal = candle.low - tolerance;
        const maxVal = candle.high + tolerance;

        if (point.value >= minVal && point.value <= maxVal) {
          useChartStyleStore.getState().setEditorOpen(true);
        }
      };

      container.addEventListener('dblclick', handleDblClick);
    }
    return () => {
      if (handleDblClick && containerRef.current) {
        containerRef.current.removeEventListener('dblclick', handleDblClick);
      }
      dispose(CHART_CONTAINER_ID);
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setStyles({
      candle: {
        bar: {
          upColor,
          downColor,
          upBorderColor,
          downBorderColor,
          upWickColor,
          downWickColor,
        },
      },
    });
  }, [upColor, downColor, upBorderColor, downBorderColor, upWickColor, downWickColor]);

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

    // Fix: If data length decreased (stepping backward), we must use applyNewData
    if (
      dataList.length === 0 ||
      isNewTimeframe ||
      chartData.length < prevDataLengthRef.current ||
      chartData.length - prevDataLengthRef.current > 1
    ) {
      chartRef.current.applyNewData(chartData);
      if (isNewTimeframe) {
        // Defer resize to allow klinecharts to process applyNewData and avoid UI freeze
        setTimeout(() => {
          chartRef.current?.resize();
        }, 50);
      }
    } else {
      chartRef.current.updateData(chartData[chartData.length - 1]);
    }

    prevTimeframeRef.current = timeframe;
    prevDataLengthRef.current = chartData.length;
  }, [aggregatedData, timeframe]);

  useEffect(() => {
    const handleResize = () => {
      chartRef.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
