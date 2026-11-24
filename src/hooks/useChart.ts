import { useRef, useEffect, useState } from 'react';
import { init, dispose, type Chart, TooltipShowRule, ActionType } from 'klinecharts';
import type { Timeframe } from '../types';
import { visibleBars, type VisibleSeries } from '../utils/series';
import { getSymbolKey } from '../lib/symbols';
import { registerCustomOverlays } from '../lib/chart/overlays';
import { CANDLE_PANE_ID } from '../lib/chart/constants';
import { registerCustomIndicators } from '../lib/chart/customIndicators';
import { useChartStyleStore } from '../store/useChartStyleStore';
import { useChartStateStore } from '../store/useChartStateStore';

interface UseChartOptions {
  containerId: string;
  symbol?: string;
  series: VisibleSeries;
  timeframe: Timeframe;
  preserveHistoryView?: boolean;
}

export function useChart({ containerId, symbol = '', series, timeframe, preserveHistoryView = false }: UseChartOptions) {
  const chartRef = useRef<Chart | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const prevTimeframeRef = useRef(timeframe);
  const prevCountRef = useRef(0);
  const prevSymbolRef = useRef(symbol);
  const symbolRef = useRef(symbol);
  const timeframeRef = useRef(timeframe);
  const restoredViewKeyRef = useRef<string | null>(null);

  useEffect(() => {
    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
  }, [symbol, timeframe]);

  const { upColor, downColor, upBorderColor, downBorderColor, upWickColor, downWickColor } = useChartStyleStore();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    registerCustomOverlays();
    registerCustomIndicators();
    const chart = init(containerId);
    let handleDblClick: ((e: MouseEvent) => void) | null = null;
    let saveViewState: (() => void) | null = null;

    if (chart) {
      chartRef.current = chart;
      // The chart needs the mounted DOM node, so it can only be created in an
      // effect; flag readiness so dependent hooks can attach to it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

      handleDblClick = (e: MouseEvent) => {
        if (!chartRef.current) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const converted = chartRef.current.convertFromPixel(
          [{ x, y }],
          { paneId: CANDLE_PANE_ID }
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
      if (handleDblClick) container.removeEventListener('dblclick', handleDblClick);
      if (saveViewState && chart) {
        chart.unsubscribeAction(ActionType.OnZoom, saveViewState);
        chart.unsubscribeAction(ActionType.OnScroll, saveViewState);
        chart.unsubscribeAction(ActionType.OnVisibleRangeChange, saveViewState);
      }
      dispose(containerId);
      chartRef.current = null;
      setIsReady(false);
    };
  }, [containerId]);

  useEffect(() => {
    const chart = chartRef.current;
    const restoreKey = `${getSymbolKey(symbol)}:${containerId}:${timeframe}`;
    if (timeframe !== prevTimeframeRef.current) {
      restoredViewKeyRef.current = restoreKey;
      return;
    }
    if (!chart || !isReady || !symbol || series.count === 0) return;
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
  }, [series.count, containerId, isReady, symbol, timeframe]);

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

  // Push the visible series into the chart. A playback step only touches
  // the last bar (and finalizes the previous one when a new bar starts);
  // anything else (seek, new data set, timeframe switch) reloads the chart.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const { bars, count, last } = series;
    const previousCount = prevCountRef.current;
    const isNewTimeframe = timeframe !== prevTimeframeRef.current;
    const isNewSymbol = symbol !== prevSymbolRef.current;
    prevTimeframeRef.current = timeframe;
    prevCountRef.current = count;
    prevSymbolRef.current = symbol;

    if (!last) {
      chart.applyNewData([]);
      return;
    }

    const loaded = chart.getDataList();
    const isSameDataSet = loaded.length > 0 && loaded[0].timestamp === (count > 1 ? bars[0] : last).timestamp;
    const isStep = count === previousCount || count === previousCount + 1;
    const previousBar = preserveHistoryView && count === previousCount ? loaded[count - 2] : undefined;
    const updatedBar = bars[count - 2];
    // Live polling can finalize the previous candle after the next one has opened.
    const correctedPreviousBar = previousBar && updatedBar && (
      previousBar.open !== updatedBar.open || previousBar.high !== updatedBar.high
      || previousBar.low !== updatedBar.low || previousBar.close !== updatedBar.close
      || previousBar.volume !== updatedBar.volume
    );

    if (!isSameDataSet || isNewTimeframe || isNewSymbol || !isStep || correctedPreviousBar) {
      const visibleEnd = preserveHistoryView && !isNewTimeframe && !isNewSymbol
        ? chart.getVisibleRange().to
        : loaded.length;
      const anchor = visibleEnd < loaded.length ? loaded[visibleEnd - 1]?.timestamp : undefined;
      const nextData = visibleBars(series);
      chart.applyNewData(nextData);
      if (isNewTimeframe) chart.scrollToRealTime();
      if (anchor !== undefined) {
        const anchorIndex = nextData.findIndex(bar => bar.timestamp >= anchor);
        if (anchorIndex >= 0) {
          const barsToScroll = chart.getVisibleRange().realTo - (anchorIndex + 1);
          chart.scrollByDistance(barsToScroll * chart.getBarSpace());
        }
      }
      if (isNewTimeframe) {
        // Defer resize to allow klinecharts to process applyNewData and avoid UI freeze
        setTimeout(() => chartRef.current?.resize(), 50);
      }
      return;
    }

    if (count === previousCount + 1 && count >= 2) {
      // The previous bar is complete now; render its final state.
      chart.updateData(bars[count - 2]);
    }
    chart.updateData(last);
  }, [preserveHistoryView, series, symbol, timeframe]);

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
