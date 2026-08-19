import { useMemo, useState, useCallback, useEffect } from 'react';
import type { Overlay } from 'klinecharts';
import { useBacktestStore } from '../../store/useBacktestStore';
import { aggregateCandles } from '../../utils/aggregation';
import { useChart } from '../../hooks/useChart';
import { useDrawingTools } from '../../hooks/useDrawingTools';
import { useUndoRedo } from '../../hooks/useUndoRedo';
import { useIndicators } from '../../hooks/useIndicators';
import { DRAWING_GROUP_ID } from '../../lib/chart/constants';
import { ChartContainer } from './ChartContainer';
import { DrawingToolbar } from './DrawingToolbar';
import { IndicatorMenu } from './IndicatorMenu';
import { IndicatorProperties } from './IndicatorProperties';
import { IndicatorLegend } from './IndicatorLegend';
import { OverlayEditor } from './OverlayEditor';
import { useTradeOverlays } from '../../hooks/useTradeOverlays';
import { SymbolLegend } from './SymbolLegend';
import { ContextMenu } from './ContextMenu';
import { useTradeStore } from '../../store/useTradeStore';
import { useExecutionStore } from '../../store/useExecutionStore';
import { useMarketDataStore } from '../../store/useMarketDataStore';
import { useContextMenu } from '../../hooks/useContextMenu';
import { CandleStyleEditor } from './CandleStyleEditor';
import { useChartStyleStore } from '../../store/useChartStyleStore';
import type { Timeframe } from '../../types';
import { fillShortCandleGaps } from '../../utils/candleGaps';
import type { ExecutionPosition } from '../../services/execution';

interface TradingChartProps {
  id: string;
  timeframe: Timeframe;
}

function sameSymbol(left: string, right: string): boolean {
  const normalizedLeft = left.trim().toUpperCase();
  const normalizedRight = right.trim().toUpperCase();
  return normalizedLeft === normalizedRight
    || normalizedLeft.split('.')[0] === normalizedRight.split('.')[0];
}

export function TradingChart({ id, timeframe }: TradingChartProps) {
  const rawData = useBacktestStore(state => state.rawData);
  const currentIndex = useBacktestStore(state => state.currentIndex);
  const mode = useBacktestStore(state => state.mode);
  const symbol = useBacktestStore(state => state.symbol);
  const marketDataLoading = useMarketDataStore(state => state.isLoading);
  const marketDataSourceId = useMarketDataStore(state => state.sourceId);
  const accountState = useExecutionStore(state => state.accountState);
  const placeOrder = useExecutionStore(state => state.placeOrder);
  const requestConfirmation = useExecutionStore(state => state.requestConfirmation);
  const askForConfirmations = useExecutionStore(state => state.askForConfirmations);

  const isEditorOpen = useChartStyleStore(state => state.isEditorOpen);
  const setEditorOpen = useChartStyleStore(state => state.setEditorOpen);


  const aggregatedData = useMemo(() => {
    if (rawData.length === 0 || currentIndex === -1) return [];
    const visibleData = rawData.slice(0, currentIndex + 1);
    const chartData = marketDataSourceId === 'rithmic'
      ? fillShortCandleGaps(visibleData)
      : visibleData;
    return aggregateCandles(chartData, timeframe);
  }, [rawData, currentIndex, timeframe, marketDataSourceId]);

  const { chartRef, containerRef, isReady: chartReady } = useChart({ containerId: id, aggregatedData, timeframe });
  const isLiveDataLoading = marketDataLoading && marketDataSourceId !== null;

  const [selectedOverlay, setSelectedOverlay] = useState<Overlay | null>(null);
  const [overlayColor, setOverlayColor] = useState('#2196F3');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [overlayFontSize, setOverlayFontSize] = useState(12);

  const position = useTradeStore(state => state.position);
  const setTakeProfit = useTradeStore(state => state.setTakeProfit);
  const setStopLoss = useTradeStore(state => state.setStopLoss);
  
  const currentPrice = rawData[currentIndex]?.close || 0;
  const livePosition: ExecutionPosition | null = mode === 'live'
    ? accountState?.positions.find(item => sameSymbol(item.symbol, symbol) && item.quantity > 0) || null
    : null;

  const { contextMenu, setContextMenu, handleContextMenu, contextMenuGroups } = useContextMenu({
    chartRef,
    containerRef,
    position,
    mode,
    symbol,
    livePosition,
    currentPrice,
    setTakeProfit,
    setStopLoss,
    placeOrder,
    requestConfirmation,
    askForConfirmations
  });

  const { undo, redo, recordAdd, recordRemove, canUndo, canRedo } = useUndoRedo();

  const indicators = useIndicators(chartRef);
  useTradeOverlays(chartRef, chartReady);

  const handleOverlayCreated = useCallback((overlay: Overlay) => {
    recordAdd(overlay);
  }, [recordAdd]);

  const handleOverlaySelected = useCallback((overlay: Overlay | null) => {
    setSelectedOverlay(overlay);
  }, []);

  const { activeTool, handleToolClick, selectedForDeleteRef } = useDrawingTools({
    chartRef,
    containerRef,
    overlayColor,
    overlayOpacity,
    overlayFontSize,
    onOverlayCreated: handleOverlayCreated,
    onOverlaySelected: handleOverlaySelected,
  });

  const clearOverlays = useCallback(() => {
    chartRef.current?.removeOverlay({ groupId: DRAWING_GROUP_ID });
    setSelectedOverlay(null);
  }, [chartRef]);

  const handleOverlayRemove = useCallback(() => {
    const chart = chartRef.current;
    if (!selectedOverlay || !chart) return;
    const overlay = chart.getOverlayById(selectedOverlay.id);
    if (overlay) {
      recordRemove(overlay);
      chart.removeOverlay({ id: selectedOverlay.id });
    }
    setSelectedOverlay(null);
  }, [selectedOverlay, chartRef, recordRemove]);

  const handleUndo = useCallback(() => {
    undo(chartRef.current, id => {
      if (selectedOverlay?.id === id) setSelectedOverlay(null);
    });
  }, [undo, chartRef, selectedOverlay]);

  const handleRedo = useCallback(() => {
    redo(chartRef.current, overlay => {
      setSelectedOverlay(overlay);
    });
  }, [redo, chartRef]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      const chart = chartRef.current;

      if (e.ctrlKey && e.shiftKey && (e.key === 'Shift' || e.key === 'Control')) {
        handleToolClick('measurement');
      } else if (isMod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo(chart, id => {
          if (selectedOverlay?.id === id) setSelectedOverlay(null);
        });
      } else if ((isMod && e.key.toLowerCase() === 'y') || (isMod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        redo(chart, overlay => {
          setSelectedOverlay(overlay);
        });
      } else if ((e.key === 'Delete') && chart) {
        const idToDelete = selectedForDeleteRef.current;
        if (idToDelete) {
          const overlay = chart.getOverlayById(idToDelete);
          if (overlay) {
            recordRemove(overlay);
            chart.removeOverlay({ id: idToDelete });
            selectedForDeleteRef.current = null;
            setSelectedOverlay(prev => (prev?.id === idToDelete ? null : prev));
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chartRef, selectedOverlay, undo, redo, recordRemove, selectedForDeleteRef]);


  return (
    <div className="w-full h-full flex flex-col bg-dark-900 text-slate-300">
      {/* Top Header Bar */}
      <div className="h-10 border-b border-dark-700 bg-dark-800 flex items-center px-4 shrink-0 overflow-visible z-[60]">
        <SymbolLegend chartId={id} />
      </div>

      <div className="flex-1 flex overflow-hidden">
        <DrawingToolbar
          activeTool={activeTool}
          onToolClick={handleToolClick}
          onClear={clearOverlays}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          showIndicatorsMenu={indicators.showAddMenu}
          onToggleIndicatorsMenu={() =>
            indicators.setShowAddMenu(!indicators.showAddMenu)
          }
        />

        <div className="flex-1 relative w-full h-full" onContextMenu={handleContextMenu}>
          <ChartContainer
            id={id}
            containerRef={containerRef}
            isLoading={isLiveDataLoading}
          />

          {/* Top-left indicator legend */}
          <IndicatorLegend
            instances={indicators.instances}
            onSelect={id => indicators.setEditingInstanceId(id)}
            onRemove={indicators.removeIndicator}
            onToggleVisibility={indicators.toggleVisibility}
          />

          {/* Add indicator dropdown */}
          {indicators.showAddMenu && (
            <IndicatorMenu
              onAdd={indicators.addIndicator}
              onClose={() => indicators.setShowAddMenu(false)}
            />
          )}

          {/* Indicator properties popup */}
          {indicators.editingInstance && (
            <IndicatorProperties
              instance={indicators.editingInstance}
              onUpdate={indicators.updateInstance}
              onRemove={indicators.removeIndicator}
              onClose={() => indicators.setEditingInstanceId(null)}
            />
          )}

          {/* Drawing overlay editor */}
          {selectedOverlay && (
            <OverlayEditor
              overlay={selectedOverlay}
              overlayColor={overlayColor}
              overlayOpacity={overlayOpacity}
              overlayFontSize={overlayFontSize}
              onColorChange={color => {
                setOverlayColor(color);
              }}
              onOpacityChange={opacity => {
                setOverlayOpacity(opacity);
              }}
              onFontSizeChange={size => {
                setOverlayFontSize(size);
              }}
              onRemove={handleOverlayRemove}
              onClose={() => setSelectedOverlay(null)}
              chartRef={chartRef}
            />
          )}

          {/* Candle style editor */}
          {isEditorOpen && (
            <CandleStyleEditor onClose={() => setEditorOpen(false)} />
          )}


          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              price={contextMenu.price}
              groups={contextMenuGroups}
              onClose={() => setContextMenu(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
