import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
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
import {
  getAnchoredIndicatorForRangeOverlay,
  getRangeOverlayForAnchoredIndicator,
} from '../../lib/chart/overlays';

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

function getOverlayTimestampRange(overlay: Overlay): [number, number] | null {
  const first = overlay.points[0]?.timestamp;
  const second = overlay.points[1]?.timestamp;
  if (typeof first !== 'number' || !Number.isFinite(first) || typeof second !== 'number' || !Number.isFinite(second)) return null;
  return [Math.min(first, second), Math.max(first, second)];
}

function isLinkedRangeOverlay(instance: { id: string; rangeOverlayId?: string }, overlayId: string): boolean {
  return instance.rangeOverlayId === overlayId || `${instance.id}_range` === overlayId;
}

export function TradingChart({ id, timeframe }: TradingChartProps) {
  const rawData = useBacktestStore(state => state.rawData);
  const currentIndex = useBacktestStore(state => state.currentIndex);
  const mode = useBacktestStore(state => state.mode);
  const symbol = useBacktestStore(state => state.symbol);
  const marketDataLoading = useMarketDataStore(state => state.isLoading);
  const marketDataSourceId = useMarketDataStore(state => state.sourceId);
  const marketDataConnectionLost = useMarketDataStore(state => state.isConnectionLost);
  const marketDataIsStale = useMarketDataStore(state => state.isDataStale);
  const marketDataSymbol = useMarketDataStore(state => state.symbol);
  const refreshMarketData = useMarketDataStore(state => state.setSymbol);
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

  const { chartRef, containerRef, isReady: chartReady } = useChart({ containerId: id, symbol, aggregatedData, timeframe });
  const isLiveDataLoading = marketDataLoading && marketDataSourceId !== null;
  const connectionWarning = marketDataSourceId === 'rithmic'
    ? marketDataConnectionLost
      ? 'Rithmic connection lost'
      : marketDataIsStale
        ? 'No Rithmic market data received recently'
        : undefined
    : undefined;

  const [selectedOverlay, setSelectedOverlay] = useState<Overlay | null>(null);
  const activeAnchoredOverlayRef = useRef<Overlay | null>(null);
  const [overlayColor, setOverlayColor] = useState('#2196F3');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [overlayFontSize, setOverlayFontSize] = useState(12);

  const position = useTradeStore(state => state.position);
  const setTakeProfit = useTradeStore(state => state.setTakeProfit);
  const setStopLoss = useTradeStore(state => state.setStopLoss);
  
  const currentPrice = rawData[currentIndex]?.close || 0;
  const handleFitChart = useCallback(() => {
    chartRef.current?.scrollToRealTime(200);
    chartRef.current?.resize();
  }, [chartRef]);

  const handleRefreshData = useCallback(() => {
    if (mode === 'live' && marketDataSymbol) {
      void refreshMarketData(marketDataSymbol);
      return;
    }
    const chart = chartRef.current;
    if (chart) chart.applyNewData(chart.getDataList());
  }, [chartRef, mode, marketDataSymbol, refreshMarketData]);

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

  const handleOverlaySelected = useCallback((overlay: Overlay | null) => {
    setSelectedOverlay(overlay);
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const previous = activeAnchoredOverlayRef.current;
    if (previous && (!selectedOverlay || previous.id !== selectedOverlay.id)) {
      const extendData = previous.extendData && typeof previous.extendData === 'object'
        ? previous.extendData as Record<string, unknown>
        : {};
      chart.overrideOverlay({
        id: previous.id,
        extendData: { ...extendData, showHandles: false },
      });
      activeAnchoredOverlayRef.current = null;
    }

    if (selectedOverlay && getAnchoredIndicatorForRangeOverlay(selectedOverlay.name)) {
      const extendData = selectedOverlay.extendData && typeof selectedOverlay.extendData === 'object'
        ? selectedOverlay.extendData as Record<string, unknown>
        : {};
      chart.overrideOverlay({
        id: selectedOverlay.id,
        extendData: { ...extendData, showHandles: true },
      });
      activeAnchoredOverlayRef.current = selectedOverlay;
    }
  }, [chartRef, selectedOverlay]);

  const indicators = useIndicators(chartRef, {
    chartId: id,
    chartReady,
    symbol,
    dataReady: aggregatedData.length > 0,
    onAnchoredOverlaySelected: handleOverlaySelected,
  });
  useTradeOverlays(chartRef, chartReady);
  const [pendingRangeIndicator, setPendingRangeIndicator] = useState<'AVWAP' | 'AVP' | null>(null);

  const handleOverlayCreated = useCallback((overlay: Overlay) => {
    const anchoredIndicator = getAnchoredIndicatorForRangeOverlay(overlay.name);
    const range = getOverlayTimestampRange(overlay);
    if (anchoredIndicator && range) {
      indicators.addIndicator(anchoredIndicator, {
        startTimestamp: range[0],
        endTimestamp: range[1],
        overlayId: overlay.id,
      });
      setPendingRangeIndicator(null);
    }
    recordAdd(overlay);
  }, [indicators, recordAdd]);

  const handleOverlayChanged = useCallback((overlay: Overlay) => {
    const anchoredIndicator = getAnchoredIndicatorForRangeOverlay(overlay.name);
    const range = getOverlayTimestampRange(overlay);
    if (anchoredIndicator && range) {
      indicators.updateAnchoredRange(overlay.id, range[0], range[1]);
    }
  }, [indicators]);

  const { activeTool, handleToolClick, selectedForDeleteRef } = useDrawingTools({
    chartRef,
    containerRef,
    overlayColor,
    overlayOpacity,
    overlayFontSize,
    onOverlayCreated: handleOverlayCreated,
    onOverlayChanged: handleOverlayChanged,
    onOverlaySelected: handleOverlaySelected,
  });

  const handleIndicatorSelect = useCallback((id: string) => {
    indicators.setEditingInstanceId(id);
    const instance = indicators.instances.find(item => item.id === id);
    if (!instance || (instance.name !== 'AVWAP' && instance.name !== 'AVP')) return;

    const overlayId = instance.rangeOverlayId ?? `${instance.id}_range`;
    const overlay = chartRef.current?.getOverlayById(overlayId);
    if (!overlay) return;
    const extendData = overlay.extendData && typeof overlay.extendData === 'object'
      ? overlay.extendData as Record<string, unknown>
      : {};
    chartRef.current?.overrideOverlay({
      id: overlay.id,
      extendData: { ...extendData, showHandles: true },
    });
    selectedForDeleteRef.current = overlay.id;
  }, [chartRef, indicators, selectedForDeleteRef]);

  const handleAddIndicator = useCallback((name: string) => {
    const rangeOverlay = getRangeOverlayForAnchoredIndicator(name);
    if (rangeOverlay) {
      setPendingRangeIndicator(name as 'AVWAP' | 'AVP');
      indicators.setShowAddMenu(false);
      handleToolClick(rangeOverlay);
      return;
    }
    indicators.addIndicator(name);
  }, [handleToolClick, indicators]);

  const removeOverlayAndLinkedIndicator = useCallback((overlay: Overlay) => {
    const linkedIndicator = indicators.instances.find(instance =>
      isLinkedRangeOverlay(instance, overlay.id),
    );
    if (linkedIndicator) {
      indicators.removeIndicator(linkedIndicator.id);
      return;
    }
    chartRef.current?.removeOverlay({ id: overlay.id });
  }, [chartRef, indicators]);

  const clearOverlays = useCallback(() => {
    chartRef.current?.removeOverlay({ groupId: DRAWING_GROUP_ID });
    setPendingRangeIndicator(null);
    setSelectedOverlay(null);
  }, [chartRef]);

  const handleOverlayRemove = useCallback(() => {
    const chart = chartRef.current;
    if (!selectedOverlay || !chart) return;
    const overlay = chart.getOverlayById(selectedOverlay.id);
    if (overlay) {
      recordRemove(overlay);
      removeOverlayAndLinkedIndicator(overlay);
    }
    setSelectedOverlay(null);
  }, [selectedOverlay, chartRef, recordRemove, removeOverlayAndLinkedIndicator]);

  const handleUndo = useCallback(() => {
    undo(chartRef.current, id => {
      if (selectedOverlay?.id === id) setSelectedOverlay(null);
      const linkedIndicator = indicators.instances.find(instance =>
        isLinkedRangeOverlay(instance, id),
      );
      if (linkedIndicator) indicators.removeIndicator(linkedIndicator.id);
    }, overlay => {
      const anchoredIndicator = getAnchoredIndicatorForRangeOverlay(overlay.name);
      const range = getOverlayTimestampRange(overlay);
      if (anchoredIndicator && range) {
        indicators.addIndicator(anchoredIndicator, {
          startTimestamp: range[0],
          endTimestamp: range[1],
          overlayId: overlay.id,
        });
      }
    });
  }, [undo, chartRef, selectedOverlay, indicators]);

  const handleRedo = useCallback(() => {
    redo(chartRef.current, overlay => {
      setSelectedOverlay(overlay);
      const anchoredIndicator = getAnchoredIndicatorForRangeOverlay(overlay.name);
      const range = getOverlayTimestampRange(overlay);
      if (anchoredIndicator && range) {
        indicators.addIndicator(anchoredIndicator, {
          startTimestamp: range[0],
          endTimestamp: range[1],
          overlayId: overlay.id,
        });
      }
    }, overlayId => {
      const linkedIndicator = indicators.instances.find(instance =>
        isLinkedRangeOverlay(instance, overlayId),
      );
      if (linkedIndicator) indicators.removeIndicator(linkedIndicator.id);
    });
  }, [redo, chartRef, indicators]);

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
          const linkedIndicator = indicators.instances.find(instance =>
            isLinkedRangeOverlay(instance, id),
          );
          if (linkedIndicator) indicators.removeIndicator(linkedIndicator.id);
        }, overlay => {
          const anchoredIndicator = getAnchoredIndicatorForRangeOverlay(overlay.name);
          const range = getOverlayTimestampRange(overlay);
          if (anchoredIndicator && range) {
            indicators.addIndicator(anchoredIndicator, {
              startTimestamp: range[0],
              endTimestamp: range[1],
              overlayId: overlay.id,
            });
          }
        });
      } else if ((isMod && e.key.toLowerCase() === 'y') || (isMod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        redo(chart, overlay => {
          setSelectedOverlay(overlay);
          const anchoredIndicator = getAnchoredIndicatorForRangeOverlay(overlay.name);
          const range = getOverlayTimestampRange(overlay);
          if (anchoredIndicator && range) {
            indicators.addIndicator(anchoredIndicator, {
              startTimestamp: range[0],
              endTimestamp: range[1],
              overlayId: overlay.id,
            });
          }
        }, overlayId => {
          const linkedIndicator = indicators.instances.find(instance =>
            isLinkedRangeOverlay(instance, overlayId),
          );
          if (linkedIndicator) indicators.removeIndicator(linkedIndicator.id);
        });
      } else if ((e.key === 'Delete') && chart) {
        const idToDelete = selectedForDeleteRef.current;
        if (idToDelete) {
          const overlay = chart.getOverlayById(idToDelete);
          if (overlay) {
            recordRemove(overlay);
            removeOverlayAndLinkedIndicator(overlay);
            selectedForDeleteRef.current = null;
            setSelectedOverlay(prev => (prev?.id === idToDelete ? null : prev));
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chartRef, selectedOverlay, undo, redo, recordRemove, selectedForDeleteRef, indicators, handleToolClick, removeOverlayAndLinkedIndicator]);


  return (
    <div className="w-full h-full flex flex-col bg-dark-900 text-slate-300">
      {/* Top Header Bar */}
      <div className="h-10 border-b border-dark-700 bg-dark-800 flex items-center pl-14 pr-4 md:px-4 shrink-0 overflow-visible z-[60]">
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
            connectionWarning={connectionWarning}
            onFitChart={handleFitChart}
            onRefreshData={handleRefreshData}
          />

          {pendingRangeIndicator && (
            <div className="pointer-events-none absolute left-4 top-4 z-40 rounded-md border border-primary-500/40 bg-dark-800/95 px-3 py-2 text-xs text-slate-200 shadow-lg">
              Draw a two-point range to anchor {pendingRangeIndicator === 'AVWAP' ? 'VWAP' : 'Volume Profile'}.
            </div>
          )}

          {/* Top-left indicator legend */}
          <IndicatorLegend
            instances={indicators.instances}
            onSelect={handleIndicatorSelect}
            onRemove={indicators.removeIndicator}
            onToggleVisibility={indicators.toggleVisibility}
          />

          {/* Add indicator dropdown */}
          {indicators.showAddMenu && (
            <IndicatorMenu
              onAdd={handleAddIndicator}
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
