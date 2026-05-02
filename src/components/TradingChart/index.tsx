import { useMemo, useState, useCallback, useEffect } from 'react';
import type { Overlay } from 'klinecharts';
import { useBacktestStore } from '../../store/useBacktestStore';
import { aggregateCandles } from '../../utils/aggregation';
import { useChart } from '../../hooks/useChart';
import { useDrawingTools } from '../../hooks/useDrawingTools';
import { useUndoRedo } from '../../hooks/useUndoRedo';
import { useIndicators } from '../../hooks/useIndicators';
import { DRAWING_GROUP_ID } from '../../lib/chart/constants';
import { clearAllTextContent, removeTextContent } from '../../lib/chart/overlays';
import { ChartContainer } from './ChartContainer';
import { DrawingToolbar } from './DrawingToolbar';
import { IndicatorMenu } from './IndicatorMenu';
import { IndicatorProperties } from './IndicatorProperties';
import { IndicatorLegend } from './IndicatorLegend';
import { OverlayEditor } from './OverlayEditor';

export function TradingChart() {
  const rawData = useBacktestStore(state => state.rawData);
  const currentIndex = useBacktestStore(state => state.currentIndex);
  const timeframe = useBacktestStore(state => state.timeframe);

  const aggregatedData = useMemo(() => {
    if (rawData.length === 0 || currentIndex === -1) return [];
    const visibleData = rawData.slice(0, currentIndex + 1);
    return aggregateCandles(visibleData, timeframe);
  }, [rawData, currentIndex, timeframe]);

  const { chartRef, containerRef } = useChart({ aggregatedData, timeframe });

  const [selectedOverlay, setSelectedOverlay] = useState<Overlay | null>(null);
  const [overlayColor, setOverlayColor] = useState('#2196F3');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);

  const { undo, redo, recordAdd, recordRemove, canUndo, canRedo } = useUndoRedo();

  const indicators = useIndicators(chartRef);

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
    onOverlayCreated: handleOverlayCreated,
    onOverlaySelected: handleOverlaySelected,
  });

  const clearOverlays = useCallback(() => {
    clearAllTextContent();
    chartRef.current?.removeOverlay({ groupId: DRAWING_GROUP_ID });
    setSelectedOverlay(null);
  }, [chartRef]);

  const handleOverlayRemove = useCallback(() => {
    const chart = chartRef.current;
    if (!selectedOverlay || !chart) return;
    const overlay = chart.getOverlayById(selectedOverlay.id);
    if (overlay) {
      recordRemove(overlay);
      removeTextContent(selectedOverlay.id);
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

      if (isMod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo(chart, id => {
          if (selectedOverlay?.id === id) setSelectedOverlay(null);
        });
      } else if ((isMod && e.key.toLowerCase() === 'y') || (isMod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        redo(chart, overlay => {
          setSelectedOverlay(overlay);
        });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && chart) {
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
    <div className="w-full h-full flex bg-dark-900 text-slate-300">
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

      <div className="flex-1 relative w-full h-full">
        <ChartContainer containerRef={containerRef} />

        {/* Top-left indicator legend (TradingView-style) */}
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
            onColorChange={color => {
              setOverlayColor(color);
            }}
            onOpacityChange={opacity => {
              setOverlayOpacity(opacity);
            }}
            onRemove={handleOverlayRemove}
            onClose={() => setSelectedOverlay(null)}
            chartRef={chartRef}
          />
        )}
      </div>
    </div>
  );
}
