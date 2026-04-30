import { useRef, useEffect, useMemo, useState } from 'react';
import { init, dispose, registerOverlay, type Chart, type Overlay } from 'klinecharts';
import { useBacktestStore } from '../store/useBacktestStore';
import { aggregateCandles } from '../utils/aggregation';
import { Square, Minus, TrendingUp, Trash2, ChevronDown, X } from 'lucide-react';

// Registrar overlay personalizado para rectángulo
registerOverlay({
  name: 'rect',
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  totalStep: 3,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return [];
    return [
      {
        type: 'polygon',
        attrs: {
          coordinates: [
            coordinates[0],
            { x: coordinates[1].x, y: coordinates[0].y },
            coordinates[1],
            { x: coordinates[0].x, y: coordinates[1].y }
          ]
        },
        styles: { style: 'stroke_fill' }
      }
    ];
  }
});

const INDICATORS_LIST = ['MA', 'EMA', 'SMA', 'MACD', 'VOL', 'RSI', 'BOLL'];

export function TradingChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  
  const rawData = useBacktestStore((state) => state.rawData);
  const currentIndex = useBacktestStore((state) => state.currentIndex);
  const timeframe = useBacktestStore((state) => state.timeframe);

  const prevTimeframeRef = useRef(timeframe);
  const prevDataLengthRef = useRef(0);

  const [activeTool, setActiveTool] = useState<string | null>(null);
  
  // Indicators State
  const [showIndicatorsMenu, setShowIndicatorsMenu] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
  const [indicatorParams, setIndicatorParams] = useState<Record<string, number[]>>({
    SMA: [14],
    EMA: [14],
    MA: [5, 10, 30, 60],
    MACD: [12, 26, 9],
    VOL: [5, 10, 20],
    RSI: [6, 12, 24],
    BOLL: [20]
  });

  // Overlay Config State
  const [selectedOverlay, setSelectedOverlay] = useState<Overlay | null>(null);
  const [overlayColor, setOverlayColor] = useState('#2196F3');

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

    const dataList = chartRef.current.getDataList();
    const isNewTimeframe = timeframe !== prevTimeframeRef.current;
    
    // If it's a completely new state, or we rewinded / jumped by a lot
    if (dataList.length === 0 || isNewTimeframe || Math.abs(chartData.length - prevDataLengthRef.current) > 1) {
       chartRef.current.applyNewData(chartData); 
       if (isNewTimeframe) chartRef.current.resize();
    } else {
       // Just stepped 1 tick (added 1 candle or updated the last one)
       // This preserves the current right-offset/scroll position!
       const lastCandle = chartData[chartData.length - 1];
       chartRef.current.updateData(lastCandle);
    }
    
    prevTimeframeRef.current = timeframe;
    prevDataLengthRef.current = chartData.length;
    
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

  const handleToolClick = (toolName: string) => {
    if (!chartRef.current) return;
    
    setActiveTool(toolName);
    chartRef.current.createOverlay({
      name: toolName,
      id: `overlay_${Date.now()}`,
      groupId: 'drawing_group',
      onDoubleClick: (event) => {
        setSelectedOverlay(event.overlay);
        // Intentar leer el color actual si existe (usando un color base para el picker)
        setOverlayColor('#2196F3'); 
        return true;
      }
    });
  };

  const clearOverlays = () => {
    if (!chartRef.current) return;
    chartRef.current.removeOverlay({ groupId: 'drawing_group' });
    setActiveTool(null);
    setSelectedOverlay(null);
  };

  const toggleIndicator = (name: string) => {
    if (activeIndicators.includes(name)) {
        chartRef.current?.removeIndicator('candle_pane', name);
        setActiveIndicators(prev => prev.filter(i => i !== name));
    } else {
        chartRef.current?.createIndicator({ name, calcParams: indicatorParams[name] }, false, { id: 'candle_pane' });
        setActiveIndicators(prev => [...prev, name]);
    }
  };

  const updateIndicatorParam = (name: string, index: number, value: number) => {
    const newParams = [...(indicatorParams[name] || [])];
    newParams[index] = value;
    setIndicatorParams(prev => ({ ...prev, [name]: newParams }));
    if (activeIndicators.includes(name)) {
        chartRef.current?.overrideIndicator({ name, calcParams: newParams }, 'candle_pane');
    }
  };

  return (
    <div className="w-full h-full flex bg-dark-900 text-slate-300">
      {/* Sidebar Toolbar */}
      <div className="flex flex-col gap-2 p-2 border-r border-dark-700 bg-dark-800 shrink-0 relative">
        <button 
          onClick={() => setShowIndicatorsMenu(!showIndicatorsMenu)}
          className={`p-2 rounded transition-colors flex items-center justify-center ${showIndicatorsMenu || activeIndicators.length > 0 ? 'bg-primary-500/20 text-primary-500 border border-primary-500/30' : 'hover:bg-dark-700 text-slate-400 border border-transparent'}`}
          title="Indicadores"
        >
          <span className="font-bold text-xs tracking-tighter">fx</span>
          <ChevronDown size={12} className="ml-0.5" />
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
        
        {/* Menu de Indicadores */}
        {showIndicatorsMenu && (
          <div className="absolute top-4 left-4 bg-dark-800 border border-dark-700 p-4 rounded shadow-2xl z-50 w-72 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-slate-200">Indicadores</h3>
              <button onClick={() => setShowIndicatorsMenu(false)} className="text-slate-400 hover:text-slate-200">
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {INDICATORS_LIST.map(ind => {
                const isActive = activeIndicators.includes(ind);
                return (
                  <div key={ind} className="flex flex-col gap-2 p-2 border border-dark-700 rounded bg-dark-900/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-300">{ind}</span>
                      <button 
                        onClick={() => toggleIndicator(ind)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${isActive ? 'bg-danger/20 text-danger border border-danger/30' : 'bg-primary-500/20 text-primary-500 border border-primary-500/30'}`}
                      >
                        {isActive ? 'Quitar' : 'Añadir'}
                      </button>
                    </div>
                    {isActive && indicatorParams[ind] && (
                      <div className="flex gap-2 items-center flex-wrap mt-1">
                        <span className="text-xs text-slate-500">Params:</span>
                        {indicatorParams[ind].map((param, idx) => (
                          <input 
                            key={idx}
                            type="number"
                            value={param}
                            onChange={(e) => updateIndicatorParam(ind, idx, Number(e.target.value))}
                            className="w-12 bg-dark-700 border border-dark-600 rounded px-1 py-0.5 text-xs text-slate-200 outline-none focus:border-primary-500"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Menu de Configuración de Overlay */}
        {selectedOverlay && (
          <div className="absolute top-4 right-4 bg-dark-800 border border-dark-700 p-4 rounded shadow-2xl z-50 w-64">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-sm font-semibold text-slate-200">Propiedades del Dibujo</h3>
               <button onClick={() => setSelectedOverlay(null)} className="text-slate-400 hover:text-slate-200">
                 <X size={16} />
               </button>
             </div>
             
             <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                   <label className="text-xs text-slate-400">Color</label>
                   <input 
                     type="color" 
                     value={overlayColor}
                     onChange={(e) => {
                        const newColor = e.target.value;
                        setOverlayColor(newColor);
                        chartRef.current?.overrideOverlay({
                           id: selectedOverlay.id,
                           styles: {
                              line: { color: newColor },
                              polygon: { color: newColor, solid: false, borderSize: 1, borderColor: newColor }
                           }
                        });
                     }}
                     className="w-full h-8 cursor-pointer rounded bg-dark-700 border border-dark-600"
                   />
                </div>
                
                <button 
                   onClick={() => {
                      chartRef.current?.removeOverlay({ id: selectedOverlay.id });
                      setSelectedOverlay(null);
                   }}
                   className="mt-2 w-full py-1.5 bg-danger/20 text-danger border border-danger/30 rounded text-sm hover:bg-danger/30 transition-colors"
                >
                   Eliminar Dibujo
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

