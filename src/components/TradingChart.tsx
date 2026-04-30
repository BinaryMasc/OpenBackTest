import { useRef, useEffect, useMemo, useState } from 'react';
import { init, dispose, registerOverlay, type Chart, type Overlay } from 'klinecharts';
import { useBacktestStore } from '../store/useBacktestStore';
import { aggregateCandles } from '../utils/aggregation';
import { Square, Minus, Trash2, ChevronDown, X, Pen, Rows4 } from 'lucide-react';

const hexToRgba = (hex: string, alpha: number) => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

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

registerOverlay({
  name: 'pencil',
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  totalStep: 1,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return [];
    return [
      {
        type: 'line',
        attrs: { coordinates },
        styles: { style: 'solid' }
      }
    ];
  }
});

registerOverlay({
  name: 'fibonacciLine',
  totalStep: 3,
  needDefaultPointFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    const p1 = coordinates[0];
    const p2 = coordinates[1];
    const figures: any[] = [];

    const color = (overlay.styles as any)?.line?.color || 'rgba(33, 150, 243, 0.7)';

    // Trend line
    figures.push({
      type: 'line',
      attrs: { coordinates: [p1, p2] },
      styles: { style: 'dashed', color: color.replace(/[\d.]+\)$/g, '0.3)') }
    });

    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);

    levels.forEach(level => {
      const y = p1.y + (p2.y - p1.y) * level;
      figures.push({
        type: 'line',
        attrs: {
          coordinates: [
            { x: minX, y },
            { x: maxX, y }
          ]
        },
        styles: { color }
      });

      // Percentage label
      figures.push({
        type: 'text',
        attrs: {
          x: minX + 5,
          y: y - 2,
          text: `${(level * 100).toFixed(1)}%`,
          align: 'left',
          baseline: 'bottom'
        },
        styles: { color: '#ffffff', size: 11 }
      });
    });

    return figures;
  }
});

const INDICATORS_LIST = ['MA', 'EMA', 'SMA', 'MACD', 'VOL', 'RSI', 'BOLL'];

type HistoryAction =
  | { type: 'ADD'; overlayId: string; config: any }
  | { type: 'REMOVE'; overlayId: string; config: any }
  | { type: 'CLEAR'; overlays: { id: string; config: any }[] };

export function TradingChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const rawData = useBacktestStore((state) => state.rawData);
  const currentIndex = useBacktestStore((state) => state.currentIndex);
  const timeframe = useBacktestStore((state) => state.timeframe);

  const prevTimeframeRef = useRef(timeframe);
  const prevDataLengthRef = useRef(0);

  // History Stacks
  const undoStack = useRef<HistoryAction[]>([]);
  const redoStack = useRef<HistoryAction[]>([]);

  const recordAction = (action: HistoryAction) => {
    undoStack.current.push(action);
    redoStack.current = []; // Clear redo stack on new action
    if (undoStack.current.length > 50) undoStack.current.shift(); // Limit history
  };

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
  const selectedForDeleteRef = useRef<string | null>(null);
  const [overlayColor, setOverlayColor] = useState('#2196F3');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);

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

  const performUndo = () => {
    const action = undoStack.current.pop();
    if (!action || !chartRef.current) return;

    redoStack.current.push(action);

    if (action.type === 'ADD') {
      chartRef.current.removeOverlay({ id: action.overlayId });
      if (selectedOverlay?.id === action.overlayId) setSelectedOverlay(null);
    } else if (action.type === 'REMOVE') {
      chartRef.current.createOverlay(action.config);
    }
  };

  const performRedo = () => {
    const action = redoStack.current.pop();
    if (!action || !chartRef.current) return;

    undoStack.current.push(action);

    if (action.type === 'ADD') {
      chartRef.current.createOverlay(action.config);
    } else if (action.type === 'REMOVE') {
      chartRef.current.removeOverlay({ id: action.overlayId });
      if (selectedOverlay?.id === action.overlayId) setSelectedOverlay(null);
    }
  };

  // Remove overlay with Delete key and Undo/Redo shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      // Undo: Ctrl+Z
      if (isMod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        performUndo();
      }
      // Redo: Ctrl+Y or Ctrl+Shift+Z
      else if ((isMod && e.key.toLowerCase() === 'y') || (isMod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        performRedo();
      }
      // Delete
      else if ((e.key === 'Delete' || e.key === 'Backspace') && chartRef.current) {
        const idToDelete = selectedForDeleteRef.current;
        if (idToDelete) {
          const overlay = chartRef.current.getOverlayById(idToDelete);
          if (overlay) {
            // Record REMOVE action
            recordAction({
              type: 'REMOVE',
              overlayId: idToDelete,
              config: {
                name: overlay.name,
                id: overlay.id,
                groupId: overlay.groupId,
                points: overlay.points,
                styles: overlay.styles,
                onSelected: overlay.onSelected,
                onDeselected: overlay.onDeselected,
                onDoubleClick: overlay.onDoubleClick
              }
            });
            chartRef.current.removeOverlay({ id: idToDelete });
            selectedForDeleteRef.current = null;
            setSelectedOverlay(prev => prev?.id === idToDelete ? null : prev);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    let isDrawing = false;
    let pencilOverlayId: string | null = null;
    let currentPoints: any[] = [];

    const handleMouseDown = (e: MouseEvent) => {
      if (activeTool !== 'pencil' || !chartRef.current) return;

      chartRef.current.setScrollEnabled(false);
      isDrawing = true;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const point = chartRef.current.convertFromPixel([{ x, y }], { paneId: 'candle_pane' })[0];
      if (!point) return;
      currentPoints = [point];

      const rgba = hexToRgba(overlayColor, overlayOpacity);

      pencilOverlayId = chartRef.current.createOverlay({
        name: 'pencil',
        groupId: 'drawing_group',
        points: currentPoints,
        styles: { line: { color: rgba, size: 2 } },
        onSelected: (event) => {
          selectedForDeleteRef.current = event.overlay.id;
          return true;
        },
        onDeselected: (event) => {
          if (selectedForDeleteRef.current === event.overlay.id) {
            selectedForDeleteRef.current = null;
          }
          return true;
        },
        onDoubleClick: (event) => {
          setSelectedOverlay(event.overlay);
          return true;
        }
      }, 'candle_pane') as string;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing || !pencilOverlayId || !chartRef.current) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const point = chartRef.current.convertFromPixel([{ x, y }], { paneId: 'candle_pane' })[0];
      if (!point) return;

      currentPoints.push(point);

      chartRef.current.overrideOverlay({
        id: pencilOverlayId,
        points: currentPoints
      });
    };

    const handleMouseUp = () => {
      if (isDrawing && chartRef.current && pencilOverlayId) {
        const overlay = chartRef.current.getOverlayById(pencilOverlayId);
        if (overlay) {
          setSelectedOverlay(overlay);
          selectedForDeleteRef.current = overlay.id;

          // Record ADD action for pencil
          recordAction({
            type: 'ADD',
            overlayId: pencilOverlayId,
            config: {
              name: 'pencil',
              id: pencilOverlayId,
              groupId: 'drawing_group',
              points: [...currentPoints],
              styles: overlay.styles,
              onSelected: overlay.onSelected,
              onDeselected: overlay.onDeselected,
              onDoubleClick: overlay.onDoubleClick
            }
          });
        }
        isDrawing = false;
        pencilOverlayId = null;
        currentPoints = [];
        chartRef.current.setScrollEnabled(true);
        setActiveTool(null);
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [activeTool, overlayColor, overlayOpacity]);

  const handleToolClick = (toolName: string) => {
    if (!chartRef.current) return;

    if (activeTool === toolName) {
      setActiveTool(null);
      return;
    }

    setActiveTool(toolName);

    if (toolName === 'pencil') return;

    const config = {
      name: toolName,
      id: `overlay_${Date.now()}`,
      groupId: 'drawing_group',
      onDrawEnd: (event: any) => {
        setSelectedOverlay(event.overlay);
        selectedForDeleteRef.current = event.overlay.id;
        setActiveTool(null);

        // Record ADD action
        recordAction({
          type: 'ADD',
          overlayId: event.overlay.id,
          config: {
            ...config,
            points: event.overlay.points,
            styles: event.overlay.styles
          }
        });
        return true;
      },
      onSelected: (event: any) => {
        selectedForDeleteRef.current = event.overlay.id;
        return true;
      },
      onDeselected: (event: any) => {
        if (selectedForDeleteRef.current === event.overlay.id) {
          selectedForDeleteRef.current = null;
        }
        return true;
      },
      onDoubleClick: (event: any) => {
        setSelectedOverlay(event.overlay);
        return true;
      }
    };

    chartRef.current.createOverlay(config);
  };

  const updateOverlayStyle = (color: string, opacity: number) => {
    if (!selectedOverlay || !chartRef.current) return;
    const rgba = hexToRgba(color, opacity);
    chartRef.current.overrideOverlay({
      id: selectedOverlay.id,
      styles: {
        line: { color: rgba },
        polygon: { color: rgba, borderSize: 1, borderColor: rgba }
      }
    });
  };

  const clearOverlays = () => {
    if (!chartRef.current) return;

    // Unfortunately klinecharts doesn't have a simple "getAllOverlaysByGroupId"
    // but we can manage our own list if needed, or just skip recording detailed clear for now.
    // However, for a better UX, let's just record that we cleared and maybe store the last state.
    // For now, I'll record a REMOVE action for each overlay if I can find them.
    // Actually, I'll just clear and not support undo for 'clear all' yet if it's too complex, 
    // OR I can use the chart instance to find them.

    // We'll just remove the whole group.
    chartRef.current.removeOverlay({ groupId: 'drawing_group' });

    setActiveTool(null);
    setSelectedOverlay(null);
    selectedForDeleteRef.current = null;

    // Note: To support undo for clearOverlays, we'd need to track all overlay IDs.
    // I'll skip UNDO for clearOverlays for now as it's a destructive "Reset" action,
    // unless the user specifically asks for it.
  };

  const toggleIndicator = (name: string) => {
    const isOscillator = ['VOL', 'RSI', 'MACD'].includes(name);
    const paneId = isOscillator ? `pane_${name}` : 'candle_pane';

    if (activeIndicators.includes(name)) {
      chartRef.current?.removeIndicator(paneId, name);
      setActiveIndicators(prev => prev.filter(i => i !== name));
    } else {
      chartRef.current?.createIndicator({ name, calcParams: indicatorParams[name] }, false, { id: paneId });
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
          <Rows4 size={20} />
        </button>

        <button
          onClick={() => handleToolClick('pencil')}
          className={`p-2 rounded transition-colors ${activeTool === 'pencil' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'hover:bg-dark-700 text-slate-400 border border-transparent'}`}
          title="Lápiz"
        >
          <Pen size={20} />
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
              <h3 className="text-sm font-semibold text-slate-200">Object Properties</h3>
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
                    updateOverlayStyle(newColor, overlayOpacity);
                  }}
                  className="w-full h-8 cursor-pointer rounded bg-dark-700 border border-dark-600"
                />
              </div>

              <div className="flex flex-col gap-1 mt-2">
                <label className="text-xs text-slate-400">Opacity ({Math.round(overlayOpacity * 100)}%)</label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={overlayOpacity}
                  onChange={(e) => {
                    const newOpacity = Number(e.target.value);
                    setOverlayOpacity(newOpacity);
                    updateOverlayStyle(overlayColor, newOpacity);
                  }}
                  className="w-full"
                />
              </div>

              <button
                onClick={() => {
                  chartRef.current?.removeOverlay({ id: selectedOverlay.id });
                  setSelectedOverlay(null);
                }}
                className="mt-2 w-full py-1.5 bg-danger/20 text-danger border border-danger/30 rounded text-sm hover:bg-danger/30 transition-colors"
              >
                Remove Drawing
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

