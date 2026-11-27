import { useState, useCallback, useRef, useEffect } from 'react';

import type { Chart, Overlay } from 'klinecharts';
import { LineType } from 'klinecharts';
import type { IndicatorChanges, IndicatorInstance } from '../types/indicatorTypes';
import {
  CANDLE_PANE_ID,
  DEFAULT_INDICATOR_PARAMS,
  INDICATOR_DEFAULT_COLORS,
  INDICATOR_RANGE_GROUP_ID,
} from '../lib/chart/constants';
import {
  commitAnchoredRangeMove,
  getAnchoredRangeLabel,
  getRangeOverlayForAnchoredIndicator,
  isAnchoredIndicator,
} from '../lib/chart/overlays';
import { getCustomIndicator, getIndicatorEngineName } from '../lib/chart/customIndicators';
import type { IndicatorLevel } from '../services/indicatorLevels';
import { useIndicatorFeeds } from './useIndicatorFeeds';
import { resolveIndicatorSettings, supportsIndicator, type IndicatorContext } from '../lib/chart/indicatorDefinition';
import { hexToRgba, isOscillatorIndicator } from '../lib/chart/utils';
import { useProjectionMargin } from './useProjectionMargin';
import type { Timeframe } from '../types';
import { getSymbolKey } from '../lib/symbols';
import { useChartStateStore } from '../store/useChartStateStore';

/**
 * Overlay indicators where each calcParam = one independent line.
 * Multiple instances are merged into a single klinecharts indicator
 * with combined calcParams and per-line styles.
 */
const MERGEABLE_OVERLAYS = new Set(['MA', 'EMA', 'SMA']);
let indicatorIdSequence = 0;

export interface AnchoredIndicatorRange {
  startTimestamp: number;
  endTimestamp: number;
  overlayId: string;
}

interface UseIndicatorsOptions {
  timeframe: Timeframe;
  chartId: string;
  chartReady: boolean;
  symbol: string;
  dataReady?: boolean;
  context?: IndicatorContext;
  onAnchoredOverlaySelected?: (overlay: Overlay) => void;
}

function selectedLevels(instance: IndicatorInstance, levels?: IndicatorLevel[]) {
  const matchesLevel = getCustomIndicator(instance.name)?.matchesLevel;
  return levels?.filter(level => (!level.visibleWhen || instance.settings?.[level.visibleWhen] === true)
    && (!matchesLevel || matchesLevel(level, instance.calcParams)));
}

function indicatorAppearance(instance: IndicatorInstance, timeframe: Timeframe) {
  const { color, opacity, settings } = instance;
  return {
    styles: { lines: [lineStyle(color, opacity)] },
    ...(settings && { extendData: { color, opacity, settings, ...(getCustomIndicator(instance.name)?.rightMargin && { timeframe }) } }),
  };
}

function lineStyle(color: string, opacity: number) {
  return { size: 2, style: LineType.Solid, smooth: false, dashedValue: [2, 2], color: hexToRgba(color, opacity) };
}

export function getRangeOverlayId(instance: Pick<IndicatorInstance, 'id' | 'rangeOverlayId'>): string {
  return instance.rangeOverlayId ?? `${instance.id}_range`;
}

/** Oscillators live in their own pane; every other indicator overlays the candles. */
function getIndicatorPane(instance: IndicatorInstance): string {
  return isOscillatorIndicator(instance.name) ? instance.paneId : CANDLE_PANE_ID;
}

function removeIndicatorInstances(chart: Chart, instances: IndicatorInstance[]): void {
  const removed = new Set<string>();
  instances.forEach(instance => {
    if (isAnchoredIndicator(instance.name)) {
      chart.removeOverlay({ id: getRangeOverlayId(instance) });
    }
    const engineName = getIndicatorEngineName(instance);
    const key = `${instance.paneId}:${engineName}`;
    if (removed.has(key)) return;
    removed.add(key);
    chart.removeIndicator(instance.paneId, engineName);
  });
}

function getAnchorTimestamps(instance: IndicatorInstance): [number, number] | null {
  const { anchorStartTimestamp: start, anchorEndTimestamp: end } = instance;
  if (Number.isFinite(start) && Number.isFinite(end)) {
    return [Math.min(start!, end!), Math.max(start!, end!)];
  }
  // Older sessions stored the range in the first two calcParams.
  if (isAnchoredIndicator(instance.name) && instance.calcParams.length >= 2) {
    const first = Number(instance.calcParams[0]);
    const second = Number(instance.calcParams[1]);
    if (Number.isFinite(first) && Number.isFinite(second)) return [Math.min(first, second), Math.max(first, second)];
  }
  return null;
}

function findDataIndex(dataList: Array<{ timestamp: number }>, timestamp: number): number {
  if (dataList.length === 0) return -1;
  const next = dataList.findIndex(data => data.timestamp >= timestamp);
  return next >= 0 ? next : dataList.length - 1;
}

function restoreRangeOverlay(
  chart: Chart,
  instance: IndicatorInstance,
  onRangeChanged: (overlayId: string, startTimestamp: number, endTimestamp: number) => void,
  onSelected?: (overlay: Overlay) => void,
): void {
  const overlayName = getRangeOverlayForAnchoredIndicator(instance.name);
  const range = getAnchorTimestamps(instance);
  if (!overlayName || !range || !isAnchoredIndicator(instance.name) || typeof chart.getDataList !== 'function') return;
  const dataList = chart.getDataList();
  if (dataList.length === 0) return;
  const points = range.map(timestamp => {
    const index = findDataIndex(dataList, timestamp);
    return { dataIndex: index, timestamp: dataList[index].timestamp, value: dataList[index].close };
  });
  chart.createOverlay({
    name: overlayName,
    id: getRangeOverlayId(instance),
    groupId: INDICATOR_RANGE_GROUP_ID,
    points,
    extendData: { label: getAnchoredRangeLabel(instance.name), color: instance.color },
    styles: {
      line: { color: hexToRgba(instance.color, instance.opacity) },
      polygon: {
        color: hexToRgba(instance.color, Math.min(instance.opacity, 0.18)),
        borderColor: instance.color,
        borderSize: 1,
      },
    },
    onSelected: (event: { overlay: Overlay }) => {
      onSelected?.(event.overlay);
      return true;
    },
    onPressedMoveEnd: (event: { overlay: Overlay }) => {
      commitAnchoredRangeMove(chart, event.overlay, (overlay, start, end) => onRangeChanged(overlay.id, start, end));
      return true;
    },
  }, CANDLE_PANE_ID);
}

function initialCalcParams(name: string, range?: AnchoredIndicatorRange): number[] {
  if (range) {
    return name === 'AVWAP'
      ? [range.startTimestamp, range.endTimestamp]
      : [range.startTimestamp, range.endTimestamp, 120, 15, 70];
  }
  // Each mergeable instance contributes a single period.
  if (MERGEABLE_OVERLAYS.has(name)) return [DEFAULT_INDICATOR_PARAMS[name]?.[0] ?? 14];
  return [...(DEFAULT_INDICATOR_PARAMS[name] || [])];
}

export function useIndicators(
  chartRef: React.RefObject<Chart | null>,
  {
    chartId = 'chart-1',
    timeframe = '1m',
    chartReady = true,
    symbol = '',
    dataReady = true,
    context,
    onAnchoredOverlaySelected,
  }: Partial<UseIndicatorsOptions> = {}
) {
  const [instances, setInstances] = useState<IndicatorInstance[]>([]);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const colorIndexRef = useRef(0);
  // Always the latest list, so chart callbacks never act on a stale render.
  const instancesRef = useRef<IndicatorInstance[]>([]);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);

  const persistenceKey = `${getSymbolKey(symbol)}:${chartId}`;

  const commit = useCallback((next: IndicatorInstance[]) => {
    instancesRef.current = next;
    setInstances(next);
  }, []);

  const nextColor = useCallback(() => {
    const color = INDICATOR_DEFAULT_COLORS[colorIndexRef.current % INDICATOR_DEFAULT_COLORS.length];
    colorIndexRef.current += 1;
    return color;
  }, []);

  /**
   * Sync all mergeable overlay instances of a given type to a single
   * klinecharts indicator with combined calcParams + per-line styles.
   */
  const syncMergedOverlay = useCallback((chart: Chart, name: string, allInstances: IndicatorInstance[]) => {
    const visible = allInstances.filter(i => i.name === name && i.paneId === CANDLE_PANE_ID && i.visible);
    chart.removeIndicator(CANDLE_PANE_ID, name);
    if (visible.length === 0) return;

    chart.createIndicator({ name, calcParams: visible.flatMap(inst => inst.calcParams) }, true, { id: CANDLE_PANE_ID });
    chart.overrideIndicator(
      { name, styles: { lines: visible.flatMap(inst => inst.calcParams.map(() => lineStyle(inst.color, inst.opacity))) } },
      CANDLE_PANE_ID,
    );
  }, []);

  const updateAnchoredRange = useCallback(
    (overlayId: string, startTimestamp: number, endTimestamp: number) => {
      const chart = chartRef.current;
      if (!chart || !Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) return;
      const instance = instancesRef.current.find(item =>
        isAnchoredIndicator(item.name) && getRangeOverlayId(item) === overlayId,
      );
      if (!instance) return;

      const start = Math.min(startTimestamp, endTimestamp);
      const end = Math.max(startTimestamp, endTimestamp);
      // AVP keeps its three visual parameters after the range.
      const visualParams = instance.name === 'AVP' ? instance.calcParams.slice(-3) : [];
      const calcParams = [start, end, ...visualParams];
      commit(instancesRef.current.map(item => item.id === instance.id
        ? { ...item, calcParams, anchorStartTimestamp: start, anchorEndTimestamp: end }
        : item));
      chart.overrideIndicator({ name: getIndicatorEngineName(instance), calcParams }, CANDLE_PANE_ID);
    },
    [chartRef, commit],
  );

  const restoreInstances = useCallback((chart: Chart, restored: IndicatorInstance[]) => {
    restored.forEach(instance => {
      if (MERGEABLE_OVERLAYS.has(instance.name)) return;
      const isOscillator = isOscillatorIndicator(instance.name);
      const engineName = getIndicatorEngineName(instance);
      const pane = getIndicatorPane(instance);
      chart.createIndicator(
        { name: engineName, calcParams: instance.calcParams, visible: instance.visible, ...indicatorAppearance(instance, timeframe) },
        !isOscillator,
        { id: pane },
      );
      if (isAnchoredIndicator(instance.name)) {
        restoreRangeOverlay(chart, instance, updateAnchoredRange, onAnchoredOverlaySelected);
      }
    });

    MERGEABLE_OVERLAYS.forEach(name => syncMergedOverlay(chart, name, restored));
  }, [onAnchoredOverlaySelected, syncMergedOverlay, updateAnchoredRange, timeframe]);

  // Restore the chart-specific indicators after the chart instance is ready.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady || !dataReady || hydratedKey === persistenceKey) return;

    removeIndicatorInstances(chart, instancesRef.current);
    const restored = useChartStateStore.getState().getIndicators(chartId, symbol)
      .map(saved => {
        // Charts saved before the stop-only feed used the book indicator name and colors.
        const instance = saved.name === 'Book Liquidity'
          ? { ...saved, name: 'Stop Liquidity', settings: { sellColor: saved.settings?.askColor ?? '#fb7185' } }
          : saved;
        const calcParams = instance.name === 'Stop Liquidity' && instance.calcParams.length === 0
          ? initialCalcParams(instance.name) : instance.calcParams;
        return resolveIndicatorSettings({ ...instance, calcParams }, getCustomIndicator(instance.name));
      });
    commit(restored);
    colorIndexRef.current = restored.length;
    setEditingInstanceId(null);
    restoreInstances(chart, restored);
    setHydratedKey(persistenceKey);
  }, [chartId, chartReady, chartRef, commit, dataReady, hydratedKey, persistenceKey, restoreInstances, symbol]);

  useEffect(() => {
    // Never let a render from before hydration overwrite the saved indicators.
    if (instances !== instancesRef.current || hydratedKey !== persistenceKey) return;
    useChartStateStore.getState().saveIndicators(chartId, instances, symbol);
  }, [chartId, hydratedKey, instances, persistenceKey, symbol]);

  /** Add a new indicator instance */
  const addIndicator = useCallback(
    (name: string, range?: AnchoredIndicatorRange) => {
      const chart = chartRef.current;
      if (!chart || !supportsIndicator(getCustomIndicator(name), context)) return;
      const isAnchored = isAnchoredIndicator(name);
      if (isAnchored && !range) return;

      const uniqueId = `${name.toLowerCase()}_${Date.now()}_${indicatorIdSequence++}`;
      const definition = getCustomIndicator(name);
      const color = definition?.defaultColor ?? nextColor();
      const calcParams = initialCalcParams(name, isAnchored ? range : undefined);
      const isMergeable = MERGEABLE_OVERLAYS.has(name);
      const instance = resolveIndicatorSettings({
        id: uniqueId,
        name,
        calcParams,
        color,
        opacity: definition?.defaultOpacity ?? 1,
        visible: true,
        paneId: CANDLE_PANE_ID,
        rangeOverlayId: range?.overlayId,
        anchorStartTimestamp: range?.startTimestamp,
        anchorEndTimestamp: range?.endTimestamp,
      }, definition);

      if (!isMergeable) {
        const isOscillator = isOscillatorIndicator(name);
        const paneId = isOscillator ? uniqueId : CANDLE_PANE_ID;
        const createdPane = chart.createIndicator(
          { name: getIndicatorEngineName(instance), calcParams, ...indicatorAppearance(instance, timeframe) },
          !isOscillator,
          { id: paneId },
        );
        if (isOscillator) instance.paneId = createdPane ?? paneId;
      }

      const next = [...instancesRef.current, instance];
      commit(next);
      setEditingInstanceId(uniqueId);

      if (isMergeable) syncMergedOverlay(chart, name, next);
      if (range && isAnchored) {
        chart.overrideOverlay({ id: range.overlayId, extendData: { label: getAnchoredRangeLabel(name), color } });
      }
      return instance;
    },
    [chartRef, commit, context, nextColor, syncMergedOverlay, timeframe],
  );

  /** Remove an indicator instance and, for anchored indicators, its range overlay. */
  const removeIndicator = useCallback(
    (id: string) => {
      const chart = chartRef.current;
      if (!chart) return;
      const instance = instancesRef.current.find(i => i.id === id);
      if (!instance) return;

      const next = instancesRef.current.filter(i => i.id !== id);
      if (MERGEABLE_OVERLAYS.has(instance.name)) {
        syncMergedOverlay(chart, instance.name, next);
      } else {
        chart.removeIndicator(getIndicatorPane(instance), getIndicatorEngineName(instance));
      }
      if (isAnchoredIndicator(instance.name)) {
        chart.removeOverlay({ id: getRangeOverlayId(instance) });
      }

      commit(next);
      setEditingInstanceId(current => (current === id ? null : current));
    },
    [chartRef, commit, syncMergedOverlay],
  );

  /** Update calculation parameters or colors of an indicator instance */
  const updateInstance = useCallback(
    (id: string, changes: IndicatorChanges) => {
      const chart = chartRef.current;
      if (!chart) return;

      const next = instancesRef.current.map(inst => inst.id === id ? {
        ...inst,
        ...changes,
        ...(changes.settings && { settings: { ...inst.settings, ...changes.settings } }),
      } : inst);
      commit(next);
      const updated = next.find(i => i.id === id);
      if (!updated) return;

      const colorChanged = changes.color !== undefined || changes.opacity !== undefined;
      if (MERGEABLE_OVERLAYS.has(updated.name)) {
        syncMergedOverlay(chart, updated.name, next);
      } else {
        const engineName = getIndicatorEngineName(updated);
        const pane = getIndicatorPane(updated);
        if (changes.calcParams) {
          chart.overrideIndicator({ name: engineName, calcParams: updated.calcParams }, pane);
        }
        if (colorChanged || changes.settings !== undefined) {
          chart.overrideIndicator({ name: engineName, ...indicatorAppearance(updated, timeframe) }, pane);
        }
      }
      if (isAnchoredIndicator(updated.name) && colorChanged) {
        chart.overrideOverlay({
          id: getRangeOverlayId(updated),
          extendData: { label: getAnchoredRangeLabel(updated.name), color: updated.color },
        });
      }
    },
    [chartRef, commit, syncMergedOverlay, timeframe],
  );

  /** Toggle visibility of an indicator instance */
  const toggleVisibility = useCallback(
    (id: string) => {
      const chart = chartRef.current;
      if (!chart) return;
      const instance = instancesRef.current.find(i => i.id === id);
      if (!instance) return;

      const visible = !instance.visible;
      const next = instancesRef.current.map(i => (i.id === id ? { ...i, visible } : i));
      commit(next);

      if (MERGEABLE_OVERLAYS.has(instance.name)) {
        syncMergedOverlay(chart, instance.name, next);
      } else {
        chart.overrideIndicator({
          name: getIndicatorEngineName(instance), visible,
          ...(getCustomIndicator(instance.name)?.rightMargin && indicatorAppearance(instance, timeframe)),
        }, getIndicatorPane(instance));
      }
      if (isAnchoredIndicator(instance.name)) {
        chart.overrideOverlay({ id: getRangeOverlayId(instance), visible });
      }
    },
    [chartRef, commit, syncMergedOverlay, timeframe],
  );

  // Projection settings depend on the chart interval even when the symbol stays the same.
  useEffect(() => {
    for (const instance of instancesRef.current) {
      if (getCustomIndicator(instance.name)?.rightMargin) {
        chartRef.current?.overrideIndicator({
          name: getIndicatorEngineName(instance), ...indicatorAppearance(instance, timeframe),
        }, CANDLE_PANE_ID);
      }
    }
  }, [chartRef, timeframe]);

  // A saved indicator keeps its settings while its feed is unavailable. Only fetch
  // for instances hydrated for the current chart, and keep snapshots out of persistence.
  const activeContext = chartReady && dataReady && hydratedKey === persistenceKey ? context : undefined;
  const snapshots = useIndicatorFeeds(instances, activeContext);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || instances !== instancesRef.current) return;
    for (const instance of instances) {
      const definition = getCustomIndicator(instance.name);
      if (!definition?.compatibility) continue;
      const visible = instance.visible && supportsIndicator(definition, activeContext);
      const snapshot = visible ? snapshots?.[instance.name] : undefined;
      chart.overrideIndicator({
        name: getIndicatorEngineName(instance), visible,
        ...(definition.compatibility.levelFeed && { extendData: {
          color: instance.color, opacity: instance.opacity, settings: instance.settings,
          levels: selectedLevels(instance, snapshot?.levels) ?? [],
        } }),
      }, getIndicatorPane(instance));
    }
  }, [activeContext, chartRef, instances, snapshots]);

  useProjectionMargin(chartRef, instances, timeframe);

  const editingInstance = instances.find(i => i.id === editingInstanceId) ?? null;

  return {
    instances,
    snapshots,
    levelsFor: (instance: IndicatorInstance) => selectedLevels(instance, snapshots?.[instance.name]?.levels),
    addIndicator,
    removeIndicator,
    updateInstance,
    updateAnchoredRange,
    toggleVisibility,
    editingInstance,
    editingLevels: editingInstance ? selectedLevels(editingInstance, snapshots?.[editingInstance.name]?.levels) : undefined,
    setEditingInstanceId,
  };
}
