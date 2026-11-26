import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { Overlay } from 'klinecharts';
import { useBacktestStore } from '../../store/useBacktestStore';
import { useChart } from '../../hooks/useChart';
import { useDrawingTools } from '../../hooks/useDrawingTools';
import { useUndoRedo } from '../../hooks/useUndoRedo';
import { getRangeOverlayId, useIndicators } from '../../hooks/useIndicators';
import { DRAWING_GROUP_ID } from '../../lib/chart/constants';
import { ChartContainer } from './ChartContainer';
import { DrawingToolbar } from './DrawingToolbar';
import { IndicatorProperties } from './IndicatorProperties';
import { IndicatorLegend } from './IndicatorLegend';
import { OverlayEditor } from './OverlayEditor';
import { useTradeOverlays } from '../../hooks/useTradeOverlays';
import { useDaySeparators } from '../../hooks/useDaySeparators';
import { SymbolLegend } from './SymbolLegend';
import { ContextMenu } from './ContextMenu';
import { useTradeStore } from '../../store/useTradeStore';
import { useExecutionStore } from '../../store/useExecutionStore';
import { useMarketDataStore } from '../../store/useMarketDataStore';
import { BinanceService } from '../../services/binance';
import { useContextMenu } from '../../hooks/useContextMenu';
import { CandleStyleEditor } from './CandleStyleEditor';
import { useChartStyleStore } from '../../store/useChartStyleStore';
import type { Timeframe } from '../../types';
import { EMPTY_SERIES, getNativeSeries, getVisibleSeries } from '../../utils/series';
import type { ExecutionPosition } from '../../services/execution';
import {
  getAnchoredIndicatorForRangeOverlay,
  getOverlayTimestampRange,
  getRangeOverlayForAnchoredIndicator,
  isAnchoredIndicator,
  isAnchoredRangeOverlay,
  patchOverlayExtendData,
  type AnchoredIndicatorName,
} from '../../lib/chart/overlays';
import { sameSymbol } from '../../lib/symbols';
import type { IndicatorInstance } from '../../types/indicatorTypes';

interface TradingChartProps {
  id: string;
  timeframe: Timeframe;
  isFirstChart?: boolean;
}

function isLinkedRangeOverlay(instance: IndicatorInstance, overlayId: string): boolean {
  return getRangeOverlayId(instance) === overlayId;
}

export function TradingChart({ id, timeframe, isFirstChart }: TradingChartProps) {
  const rawData = useBacktestStore(state => state.rawData);
  const currentIndex = useBacktestStore(state => state.currentIndex);
  const mode = useBacktestStore(state => state.mode);
  const symbol = useBacktestStore(state => state.symbol);
  const marketDataConnected = useMarketDataStore(state => state.isConnected);
  const marketDataLoading = useMarketDataStore(state => state.isLoading);
  const marketDataSourceId = useMarketDataStore(state => state.sourceId);
  const marketDataConnectionLost = useMarketDataStore(state => state.isConnectionLost);
  const marketDataIsStale = useMarketDataStore(state => state.isDataStale);
  const marketDataSymbol = useMarketDataStore(state => state.symbol);
  const refreshMarketData = useMarketDataStore(state => state.setSymbol);
  const binanceHistory = useMarketDataStore(state => state.binanceHistory[timeframe]);
  const reloadBinanceHistory = useMarketDataStore(state => state.reloadBinanceHistory);
  const accountState = useExecutionStore(state => state.accountState);
  const placeOrder = useExecutionStore(state => state.placeOrder);
  const requestConfirmation = useExecutionStore(state => state.requestConfirmation);
  const askForConfirmations = useExecutionStore(state => state.askForConfirmations);

  const isEditorOpen = useChartStyleStore(state => state.isEditorOpen);
  const setEditorOpen = useChartStyleStore(state => state.setEditorOpen);


  const isBinanceChart = marketDataConnected && marketDataSourceId === BinanceService.id && symbol === marketDataSymbol;
  const usesNativeHistory = isBinanceChart && timeframe !== '1m';
  const candles = usesNativeHistory ? binanceHistory?.candles : rawData;
  const cursor = usesNativeHistory ? undefined : currentIndex;
  const series = useMemo(() => {
    if (!candles) return EMPTY_SERIES;
    return cursor === undefined ? getNativeSeries(candles) : getVisibleSeries(candles, timeframe, cursor);
  }, [candles, cursor, timeframe]);

  const { chartRef, containerRef, isReady: chartReady } = useChart({
    containerId: id, symbol, series, timeframe, preserveHistoryView: isBinanceChart
  });
  const isLiveDataLoading = (isBinanceChart ? binanceHistory?.isLoading ?? marketDataLoading : marketDataLoading)
    && marketDataSourceId !== null;
  const rithmicWarning = marketDataSourceId === 'rithmic'
    ? marketDataConnectionLost
      ? 'Rithmic connection lost'
      : marketDataIsStale
        ? 'No Rithmic market data received recently'
        : undefined
    : undefined;
  const connectionWarning = isBinanceChart ? binanceHistory?.error ?? undefined : rithmicWarning;

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
    if (isBinanceChart) {
      void reloadBinanceHistory(timeframe);
      return;
    }
    if (mode === 'live' && marketDataSymbol) {
      void refreshMarketData(marketDataSymbol);
      return;
    }
    const chart = chartRef.current;
    if (chart) chart.applyNewData(chart.getDataList());
  }, [chartRef, isBinanceChart, reloadBinanceHistory, timeframe, mode, marketDataSymbol, refreshMarketData]);

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
    if (previous && previous.id !== selectedOverlay?.id) {
      patchOverlayExtendData(chart, previous, { showHandles: false });
      activeAnchoredOverlayRef.current = null;
    }

    if (selectedOverlay && isAnchoredRangeOverlay(selectedOverlay.name)) {
      patchOverlayExtendData(chart, selectedOverlay, { showHandles: true });
      activeAnchoredOverlayRef.current = selectedOverlay;
    }
  }, [chartRef, selectedOverlay]);

  const indicators = useIndicators(chartRef, {
    chartId: id,
    timeframe,
    chartReady,
    symbol,
    dataReady: series.count > 0,
    onAnchoredOverlaySelected: handleOverlaySelected,
  });
  useTradeOverlays(chartRef, chartReady, series.bars);
  useDaySeparators(chartRef, chartReady);
  const [pendingRangeIndicator, setPendingRangeIndicator] = useState<AnchoredIndicatorName | null>(null);
  const { addIndicator, removeIndicator, instances: indicatorInstances } = indicators;

  /** Creates the anchored indicator that a range overlay drives, if any. */
  const attachAnchoredIndicator = useCallback((overlay: Overlay): boolean => {
    const anchoredIndicator = getAnchoredIndicatorForRangeOverlay(overlay.name);
    const range = getOverlayTimestampRange(overlay);
    if (!anchoredIndicator || !range) return false;
    addIndicator(anchoredIndicator, {
      startTimestamp: range[0],
      endTimestamp: range[1],
      overlayId: overlay.id,
    });
    return true;
  }, [addIndicator]);

  /** Removes the anchored indicator linked to a range overlay, if any. */
  const detachAnchoredIndicator = useCallback((overlayId: string) => {
    const linkedIndicator = indicatorInstances.find(instance => isLinkedRangeOverlay(instance, overlayId));
    if (linkedIndicator) removeIndicator(linkedIndicator.id);
  }, [indicatorInstances, removeIndicator]);

  const handleOverlayCreated = useCallback((overlay: Overlay) => {
    if (attachAnchoredIndicator(overlay)) setPendingRangeIndicator(null);
    recordAdd(overlay);
  }, [attachAnchoredIndicator, recordAdd]);

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
    const chart = chartRef.current;
    const instance = indicators.instances.find(item => item.id === id);
    if (!chart || !instance || !isAnchoredIndicator(instance.name)) return;

    const overlay = chart.getOverlayById(getRangeOverlayId(instance));
    if (!overlay) return;
    patchOverlayExtendData(chart, overlay, { showHandles: true });
    selectedForDeleteRef.current = overlay.id;
  }, [chartRef, indicators, selectedForDeleteRef]);

  const handleAddIndicator = useCallback((name: string) => {
    const rangeOverlay = getRangeOverlayForAnchoredIndicator(name);
    if (rangeOverlay && isAnchoredIndicator(name)) {
      setPendingRangeIndicator(name);
      handleToolClick(rangeOverlay);
      return;
    }
    indicators.addIndicator(name);
  }, [handleToolClick, indicators]);

  const removeOverlayAndLinkedIndicator = useCallback((overlay: Overlay) => {
    const linkedIndicator = indicatorInstances.find(instance => isLinkedRangeOverlay(instance, overlay.id));
    if (linkedIndicator) {
      // Removing the indicator also removes its range overlay.
      removeIndicator(linkedIndicator.id);
      return;
    }
    chartRef.current?.removeOverlay({ id: overlay.id });
  }, [chartRef, indicatorInstances, removeIndicator]);

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
    undo(chartRef.current, overlayId => {
      setSelectedOverlay(prev => (prev?.id === overlayId ? null : prev));
      detachAnchoredIndicator(overlayId);
    }, attachAnchoredIndicator);
  }, [undo, chartRef, detachAnchoredIndicator, attachAnchoredIndicator]);

  const handleRedo = useCallback(() => {
    redo(chartRef.current, overlay => {
      setSelectedOverlay(overlay);
      attachAnchoredIndicator(overlay);
    }, detachAnchoredIndicator);
  }, [redo, chartRef, attachAnchoredIndicator, detachAnchoredIndicator]);

  const deleteSelectedOverlay = useCallback(() => {
    const chart = chartRef.current;
    const idToDelete = selectedForDeleteRef.current;
    if (!chart || !idToDelete) return;
    const overlay = chart.getOverlayById(idToDelete);
    if (!overlay) return;
    recordRemove(overlay);
    removeOverlayAndLinkedIndicator(overlay);
    selectedForDeleteRef.current = null;
    setSelectedOverlay(prev => (prev?.id === idToDelete ? null : prev));
  }, [chartRef, selectedForDeleteRef, recordRemove, removeOverlayAndLinkedIndicator]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (e.ctrlKey && e.shiftKey && (e.key === 'Shift' || e.key === 'Control')) {
        handleToolClick('measurement');
      } else if (isMod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (isMod && (key === 'y' || (e.shiftKey && key === 'z'))) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Delete') {
        deleteSelectedOverlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleToolClick, deleteSelectedOverlay]);

  return (
    <div className="w-full h-full flex flex-col bg-dark-900 text-slate-300">
      {/* Top Header Bar */}
      <div className={`h-10 border-b border-dark-700 bg-dark-800 flex items-center pr-4 shrink-0 overflow-visible z-[60] ${isFirstChart ? 'pl-14' : 'pl-4'}`}>
        <SymbolLegend chartId={id} />
      </div>

      <div className="@container flex-1 flex overflow-hidden">
        <DrawingToolbar
          activeTool={activeTool}
          onToolClick={handleToolClick}
          onClear={clearOverlays}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          onAddIndicator={handleAddIndicator}
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
              onColorChange={setOverlayColor}
              onOpacityChange={setOverlayOpacity}
              onFontSizeChange={setOverlayFontSize}
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
