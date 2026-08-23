import { useRef, useEffect, useState } from 'react';
import { init, dispose, type Chart, TooltipShowRule, ActionType } from 'klinecharts';
import type { Candle, Timeframe } from '../types';
import { registerCustomOverlays } from '../lib/chart/overlays';
import { registerCustomIndicators } from '../lib/chart/customIndicators';
import { useChartStyleStore } from '../store/useChartStyleStore';
import { useChartStateStore } from '../store/useChartStateStore';

interface UseChartOptions {
  containerId: string;
  symbol?: string;
  aggregatedData: Candle[];
  timeframe: Timeframe;
}

export function useChart({ containerId, symbol = '', aggregatedData, timeframe }: UseChartOptions) {
  const chartRef = useRef<Chart | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const prevTimeframeRef = useRef(timeframe);
  const prevDataLengthRef = useRef(0);
  const symbolRef = useRef(symbol);
  const timeframeRef = useRef(timeframe);
  const restoredViewKeyRef = useRef<string | null>(null);

  useEffect(() => {
    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
  }, [symbol, timeframe]);

  const { upColor, downColor, upBorderColor, downBorderColor, upWickColor, downWickColor } = useChartStyleStore();

  useEffect(() => {
    if (!containerRef.current) return;
    registerCustomOverlays();
    registerCustomIndicators();
    const chart = init(containerId);
    let handleDblClick: ((e: MouseEvent) => void) | null = null;
    let saveViewState: (() => void) | null = null;

    if (chart) {
      chartRef.current = chart;
      setIsReady(true);
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
          tooltip: {
            text: { family: '"Fira Sans", sans-serif' }
          }
        },
        xAxis: {
          tickText: { family: '"Fira Sans", sans-serif' }
        },
        yAxis: {
          tickText: { family: '"Fira Sans", sans-serif' }
        },
        crosshair: {
          horizontal: { text: { family: '"Fira Sans", sans-serif' } },
          vertical: { text: { family: '"Fira Sans", sans-serif' } }
        },
        indicator: {
          tooltip: {
            showRule: TooltipShowRule.None,
            text: { family: '"Fira Sans", sans-serif' }
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

      saveViewState = () => {
        const currentSymbol = symbolRef.current;
        if (!currentSymbol) return;
        const visibleRange = chart.getVisibleRange();
        const barSpace = chart.getBarSpace();
        if (!Number.isFinite(barSpace) || !Number.isFinite(visibleRange.to)) return;
        useChartStateStore.getState().saveView(
          currentSymbol,
          containerId,
          timeframeRef.current,
          { barSpace, lastVisibleIndex: visibleRange.to },
        );
      };

      chart.subscribeAction(ActionType.OnZoom, saveViewState);
      chart.subscribeAction(ActionType.OnScroll, saveViewState);
      chart.subscribeAction(ActionType.OnVisibleRangeChange, saveViewState);
    }
    return () => {
      if (handleDblClick && containerRef.current) {
        containerRef.current.removeEventListener('dblclick', handleDblClick);
      }
      if (saveViewState && chart) {
        chart.unsubscribeAction(ActionType.OnZoom, saveViewState);
        chart.unsubscribeAction(ActionType.OnScroll, saveViewState);
        chart.unsubscribeAction(ActionType.OnVisibleRangeChange, saveViewState);
      }
      dispose(containerId);
      chartRef.current = null;
      setIsReady(false);
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !isReady || !symbol || aggregatedData.length === 0) return;

    const restoreKey = `${symbol.trim().toUpperCase()}:${containerId}:${timeframe}`;
    if (restoredViewKeyRef.current === restoreKey) return;

    const savedView = useChartStateStore.getState().getView(symbol, containerId, timeframe);
    restoredViewKeyRef.current = restoreKey;
    if (!savedView) return;

    const restoreTimeout = setTimeout(() => {
      const currentChart = chartRef.current;
      if (!currentChart) return;
      if (Number.isFinite(savedView.barSpace) && savedView.barSpace > 0) {
        currentChart.setBarSpace(savedView.barSpace);
      }
      const lastIndex = currentChart.getDataList().length - 1;
      if (lastIndex >= 0) {
        currentChart.scrollToDataIndex(
          Math.max(0, Math.min(savedView.lastVisibleIndex, lastIndex)),
        );
      }
    }, 0);

    return () => clearTimeout(restoreTimeout);
  }, [aggregatedData.length, containerId, isReady, symbol, timeframe]);

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
    if (!chartRef.current) return;

    if (aggregatedData.length === 0) {
      chartRef.current.applyNewData([]);
      prevDataLengthRef.current = 0;
      return;
    }

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
      const lastChartTimestamp = dataList[dataList.length - 1]?.timestamp;
      const lastDataTimestamp = chartData[chartData.length - 1].timestamp;
      const startedNewCandle = chartData.length > dataList.length
        || (lastChartTimestamp !== undefined && lastDataTimestamp > lastChartTimestamp);
      if (chartData.length >= 2 && startedNewCandle) {
        // Update the second-to-last candle as well to ensure its final closed state is rendered
        chartRef.current.updateData(chartData[chartData.length - 2]);
      }
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

  return { chartRef, containerRef, isReady };
}
