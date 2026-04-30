import { useRef, useEffect, useMemo, useState } from 'react';
import { init, dispose, type Chart } from 'klinecharts';
import { useBacktestStore } from '../store/useBacktestStore';
import { aggregateCandles } from '../utils/aggregation';
import { Square, Minus, TrendingUp, Trash2, Activity } from 'lucide-react';

export function TradingChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  
  const rawData = useBacktestStore((state) => state.rawData);
  const currentIndex = useBacktestStore((state) => state.currentIndex);
  const timeframe = useBacktestStore((state) => state.timeframe);

  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [showMA, setShowMA] = useState(false);

  const aggregatedData = useMemo(() => {
    if (rawData.length === 0 || currentIndex === -1) return [];
    const visibleData = rawData.slice(0, currentIndex + 1);
    return aggregateCandles(visibleData, timeframe);
  }, [rawData, currentIndex, timeframe]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = init('kline-chart-container');

    if (chart) {
       chartRef.current = chart;
       chart.setStyles('dark'); // Built-in dark theme
       (window as any).chart = chart;
    }

    return () => {
      dispose('kline-chart-container');
    };
  }, []);

  // Update data when aggregatedData changes
  useEffect(() => {
    if (!chartRef.current || aggregatedData.length === 0) return;
    
    // KLineChart format: { timestamp, open, close, high, low, volume }
    const chartData = aggregatedData.map(d => ({
      timestamp: d.time * 1000,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume || 0,
    }));

    (window as any).chartData = chartData;

    chartRef.current.applyNewData(chartData); 
    chartRef.current.resize();
    
  }, [aggregatedData, timeframe]);

  // Handle resize observer
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current) {
        chartRef.current.resize();
      }
    });
    resizeObserver.observe(chartContainerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Toggle MA indicator
  useEffect(() => {
    if (!chartRef.current) return;
    
    if (showMA) {
      chartRef.current.createIndicator('MA', false, { id: 'candle_pane' });
    } else {
      chartRef.current.removeIndicator('candle_pane', 'MA');
    }
  }, [showMA]);

  const handleToolClick = (toolName: string) => {
    if (!chartRef.current) return;
    
    setActiveTool(toolName);
    chartRef.current.createOverlay({
      name: toolName,
      id: `overlay_${Date.now()}`,
      groupId: 'drawing_group'
    });
  };

  const clearOverlays = () => {
    if (!chartRef.current) return;
    chartRef.current.removeOverlay({ groupId: 'drawing_group' });
    setActiveTool(null);
  };

  return (
    <div className="w-full h-full flex bg-dark-900 text-slate-300">
      {/* Sidebar Toolbar */}
      <div className="flex flex-col gap-2 p-2 border-r border-dark-700 bg-dark-800 shrink-0">
        <button 
          onClick={() => setShowMA(!showMA)}
          className={`p-2 rounded transition-colors ${showMA ? 'bg-primary-500/20 text-primary-500 border border-primary-500/30' : 'hover:bg-dark-700 text-slate-400 border border-transparent'}`}
          title="Moving Average (MA)"
        >
          <Activity size={20} />
        </button>
        
        <div className="w-full h-px bg-dark-700 my-1"></div>
        
        <button 
          onClick={() => handleToolClick('segment')}
          className={`p-2 rounded transition-colors ${activeTool === 'segment' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'hover:bg-dark-700 text-slate-400 border border-transparent'}`}
          title="Línea de Tendencia"
        >
          <Minus size={20} />
        </button>
        
        <button 
          onClick={() => handleToolClick('rect')}
          className={`p-2 rounded transition-colors ${activeTool === 'rect' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'hover:bg-dark-700 text-slate-400 border border-transparent'}`}
          title="Rectángulo"
        >
          <Square size={20} />
        </button>
        
        <button 
          onClick={() => handleToolClick('fibonacciLine')}
          className={`p-2 rounded transition-colors ${activeTool === 'fibonacciLine' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'hover:bg-dark-700 text-slate-400 border border-transparent'}`}
          title="Retroceso de Fibonacci"
        >
          <TrendingUp size={20} />
        </button>

        <div className="mt-auto">
          <button 
            onClick={clearOverlays}
            className="p-2 rounded transition-colors hover:bg-danger/20 hover:text-danger hover:border-danger/30 border border-transparent text-slate-400"
            title="Limpiar Herramientas"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>
      
      {/* Chart Container */}
      <div className="flex-1 relative w-full h-full">
        <div id="kline-chart-container" className="absolute inset-0" ref={chartContainerRef} />
      </div>
    </div>
  );
}
