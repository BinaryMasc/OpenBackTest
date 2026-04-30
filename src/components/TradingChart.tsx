import { useRef, useEffect, useMemo } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useBacktestStore } from '../store/useBacktestStore';
import { aggregateCandles } from '../utils/aggregation';

export function TradingChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  
  const rawData = useBacktestStore((state) => state.rawData);
  const currentIndex = useBacktestStore((state) => state.currentIndex);
  const timeframe = useBacktestStore((state) => state.timeframe);

  const aggregatedData = useMemo(() => {
    if (rawData.length === 0 || currentIndex === -1) return [];
    const visibleData = rawData.slice(0, currentIndex + 1);
    return aggregateCandles(visibleData, timeframe);
  }, [rawData, currentIndex, timeframe]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#0f172a' }, // Tailwind dark-900
        textColor: '#cbd5e1', // Tailwind slate-300
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', // Tailwind success
      downColor: '#ef4444', // Tailwind danger
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
    };
  }, []);

  // Update data when aggregatedData changes
  useEffect(() => {
    if (!seriesRef.current || aggregatedData.length === 0) return;
    
    // Convert to lightweight-charts compatible format (Time type)
    const chartData = aggregatedData.map(d => ({
      time: d.time as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    seriesRef.current.setData(chartData);
    
  }, [aggregatedData, timeframe]);

  return (
    <div className="w-full h-full relative" ref={chartContainerRef} />
  );
}
