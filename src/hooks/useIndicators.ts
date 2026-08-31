import { useState, useCallback, useRef, useEffect } from 'react';

import type { Chart, Overlay } from 'klinecharts';
import { LineType } from 'klinecharts';
import type { IndicatorInstance } from '../types/indicatorTypes';
import {
  DEFAULT_INDICATOR_PARAMS,
  INDICATORS_LIST,
  INDICATOR_DEFAULT_COLORS,
} from '../lib/chart/constants';
import { INDICATOR_RANGE_GROUP_ID } from '../lib/chart/constants';
import { clampAnchoredRangeToData, getRangeOverlayForAnchoredIndicator } from '../lib/chart/overlays';
import { getAnchoredIndicatorEngineName, registerAnchoredIndicatorInstance } from '../lib/chart/customIndicators';
import { isOscillatorIndicator } from '../lib/chart/utils';
import { hexToRgba } from '../lib/chart/utils';
import { useChartStateStore } from '../store/useChartStateStore';

/**
 * Overlay indicators where each calcParam = one independent line.
 * Multiple instances are merged into a single klinecharts indicator
 * with combined calcParams and per-line styles.
 */
const MERGEABLE_OVERLAYS = new Set(['MA', 'EMA', 'SMA']);
const RANGE_INDICATORS = new Set(['AVWAP', 'AVP']);
let indicatorIdSequence = 0;

export interface AnchoredIndicatorRange {
  startTimestamp: number;
  endTimestamp: number;
  overlayId: string;
}

interface UseIndicatorsOptions {
  chartId: string;
  chartReady: boolean;
  symbol: string;
  dataReady?: boolean;
  onAnchoredOverlaySelected?: (overlay: Overlay) => void;
}

function removeIndicatorInstances(chart: Chart, instances: IndicatorInstance[]): void {
  const removed = new Set<string>();
  instances.forEach(instance => {
    if (RANGE_INDICATORS.has(instance.name)) {
      chart.removeOverlay({ id: getRangeOverlayId(instance) });
    }
    const key = `${instance.paneId}:${getIndicatorEngineName(instance)}`;
    if (removed.has(key)) return;
    removed.add(key);
    chart.removeIndicator(instance.paneId, getIndicatorEngineName(instance));
  });
}

function getRangeOverlayId(instance: IndicatorInstance): string {
  return instance.rangeOverlayId ?? `${instance.id}_range`;
}

function getIndicatorEngineName(instance: IndicatorInstance): string {
  if (!RANGE_INDICATORS.has(instance.name)) return instance.name;
  const name = instance.name as 'AVWAP' | 'AVP';
  const engineName = getAnchoredIndicatorEngineName(name, instance.id);
  registerAnchoredIndicatorInstance(name, engineName);
  return engineName;
}

function getAnchorTimestamps(instance: IndicatorInstance): [number, number] | null {
  if (Number.isFinite(instance.anchorStartTimestamp) && Number.isFinite(instance.anchorEndTimestamp)) {
    return [
      Math.min(instance.anchorStartTimestamp as number, instance.anchorEndTimestamp as number),
      Math.max(instance.anchorStartTimestamp as number, instance.anchorEndTimestamp as number),
    ];
  }
  if (RANGE_INDICATORS.has(instance.name) && instance.calcParams.length >= 2) {
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

function getOverlayTimestampRange(overlay: Overlay): [number, number] | null {
  const first = overlay.points[0]?.timestamp;
  const second = overlay.points[1]?.timestamp;
  if (typeof first !== 'number' || !Number.isFinite(first) || typeof second !== 'number' || !Number.isFinite(second)) return null;
  return [Math.min(first, second), Math.max(first, second)];
}

function restoreRangeOverlay(
  chart: Chart,
  instance: IndicatorInstance,
  onRangeChanged: (overlayId: string, startTimestamp: number, endTimestamp: number) => void,
  onSelected?: (overlay: Overlay) => void,
): void {
  const overlayName = getRangeOverlayForAnchoredIndicator(instance.name);
  const range = getAnchorTimestamps(instance);
  if (!overlayName || !range || typeof chart.getDataList !== 'function') return;
  const dataList = chart.getDataList();
  if (dataList.length === 0) return;
  const startIndex = findDataIndex(dataList, range[0]);
  const endIndex = findDataIndex(dataList, range[1]);
  if (startIndex < 0 || endIndex < 0) return;
  const points = [startIndex, endIndex].map(index => ({
    dataIndex: index,
    timestamp: dataList[index].timestamp,
    value: dataList[index].close,
  }));
  chart.createOverlay({
    name: overlayName,
    id: getRangeOverlayId(instance),
    groupId: INDICATOR_RANGE_GROUP_ID,
    points,
    extendData: {
      label: instance.name === 'AVWAP' ? 'Anchored VWAP range' : 'Anchored Volume Profile range',
      color: instance.color,
    },
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
      const range = getOverlayTimestampRange(clampAnchoredRangeToData(chart, event.overlay));
      if (range) onRangeChanged(event.overlay.id, range[0], range[1]);
      const extendData = event.overlay.extendData && typeof event.overlay.extendData === 'object'
        ? event.overlay.extendData as Record<string, unknown>
        : {};
      chart.overrideOverlay({
        id: event.overlay.id,
        extendData: { ...extendData, showHandles: true },
      });
      return true;
    },
  }, 'candle_pane');
}

export function useIndicators(
  chartRef: React.RefObject<Chart | null>,
  {
    chartId = 'chart-1',
    chartReady = true,
    symbol = '',
    dataReady = true,
    onAnchoredOverlaySelected,
  }: Partial<UseIndicatorsOptions> = {}
) {
  const [instances, setInstances] = useState<IndicatorInstance[]>([]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const colorIndexRef = useRef(0);
  const instancesRef = useRef<IndicatorInstance[]>([]);
  const hydratedKeyRef = useRef<string | null>(null);

  const persistenceKey = `${symbol.trim().toUpperCase() || '__default__'}:${chartId}`;

  const nextColor = useCallback(() => {
    const color = INDICATOR_DEFAULT_COLORS[colorIndexRef.current % INDICATOR_DEFAULT_COLORS.length];
    colorIndexRef.current += 1;
    return color;
  }, []);

  /**
   * Sync all mergeable overlay instances of a given type to a single
   * klinecharts indicator with combined calcParams + per-line styles.
   */
  const syncOverlay = useCallback(
    (chart: Chart, name: string, allInstances: IndicatorInstance[]) => {
      const visible = allInstances.filter(
        i => i.name === name && i.paneId === 'candle_pane' && i.visible,
      );

      // Always remove first to avoid stale state
      chart.removeIndicator('candle_pane', name);

      if (visible.length === 0) return;

      // Merge calcParams: each instance contributes its period(s)
      const mergedParams = visible.flatMap(inst => inst.calcParams);

      chart.createIndicator(
        { name, calcParams: mergedParams },
        true,
        { id: 'candle_pane' },
      );

      // Build per-line styles matching each calcParam entry
      const lineStyles = visible.flatMap(inst =>
        inst.calcParams.map(() => ({
          size: 2,
          style: LineType.Solid,
          smooth: false,
          dashedValue: [2, 2],
          color: hexToRgba(inst.color, inst.opacity),
        })),
      );

      chart.overrideIndicator(
        { name, styles: { lines: lineStyles } },
        'candle_pane',
      );
    },
    [],
  );

  const updateAnchoredRange = useCallback(
    (overlayId: string, startTimestamp: number, endTimestamp: number) => {
      const chart = chartRef.current;
      if (!chart || !Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) return;
      const currentInstances = instancesRef.current;
      const instance = currentInstances.find(item =>
        RANGE_INDICATORS.has(item.name) && getRangeOverlayId(item) === overlayId,
      );
      if (!instance) return;

      const start = Math.min(startTimestamp, endTimestamp);
      const end = Math.max(startTimestamp, endTimestamp);
      const visualParams = instance.name === 'AVP' ? instance.calcParams.slice(-3) : [];
      const calcParams = [start, end, ...visualParams];
      const newInstances = currentInstances.map(item => item.id === instance.id
        ? {
            ...item,
            calcParams,
            anchorStartTimestamp: start,
            anchorEndTimestamp: end,
          }
        : item);
      setInstances(newInstances);
      instancesRef.current = newInstances;
      chart.overrideIndicator({ name: getIndicatorEngineName(instance), calcParams }, 'candle_pane');
    },
    [chartRef],
  );

  const restoreInstances = useCallback((chart: Chart, restoredInstances: IndicatorInstance[]) => {
    const oscillatorInstances = restoredInstances.filter(instance => isOscillatorIndicator(instance.name));
    const standaloneInstances = restoredInstances.filter(instance =>
      !isOscillatorIndicator(instance.name) && !MERGEABLE_OVERLAYS.has(instance.name),
    );

    oscillatorInstances.forEach(instance => {
      chart.createIndicator(
        { name: instance.name, calcParams: instance.calcParams },
        false,
        { id: instance.paneId },
      );
      chart.overrideIndicator(
        {
          name: instance.name,
          visible: instance.visible,
          styles: {
            lines: [{
              size: 2,
              style: LineType.Solid,
              smooth: false,
              dashedValue: [2, 2],
              color: hexToRgba(instance.color, instance.opacity),
            }]
          }
        },
        instance.paneId,
      );
    });

    standaloneInstances.forEach(instance => {
      const engineName = getIndicatorEngineName(instance);
      chart.createIndicator(
        { name: engineName, calcParams: instance.calcParams },
        true,
        { id: 'candle_pane' },
      );
      chart.overrideIndicator(
        {
          name: engineName,
          visible: instance.visible,
          styles: {
            lines: [{
              size: 2,
              style: LineType.Solid,
              smooth: false,
              dashedValue: [2, 2],
              color: hexToRgba(instance.color, instance.opacity),
            }]
          }
        },
        'candle_pane',
      );
       if (RANGE_INDICATORS.has(instance.name)) {
         restoreRangeOverlay(chart, instance, updateAnchoredRange, onAnchoredOverlaySelected);
       }
    });

    MERGEABLE_OVERLAYS.forEach(name => syncOverlay(chart, name, restoredInstances));
  }, [onAnchoredOverlaySelected, syncOverlay, updateAnchoredRange]);

  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);

  // Restore the chart-specific indicators after the chart instance is ready.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady || !dataReady || hydratedKeyRef.current === persistenceKey) return;

    removeIndicatorInstances(chart, instancesRef.current);
    const restoredInstances = useChartStateStore.getState().getIndicators(chartId, symbol);
    setInstances(restoredInstances);
    instancesRef.current = restoredInstances;
    colorIndexRef.current = restoredInstances.length;
    setEditingInstanceId(null);
    restoreInstances(chart, restoredInstances);
    hydratedKeyRef.current = persistenceKey;
  }, [chartId, chartReady, chartRef, dataReady, persistenceKey, restoreInstances, symbol]);

  useEffect(() => {
    // A restore effect can update the ref before this effect runs in the same
    // commit. Do not let the pre-restore render overwrite saved indicators.
    if (instances !== instancesRef.current || hydratedKeyRef.current !== persistenceKey) return;
    useChartStateStore.getState().saveIndicators(chartId, instances, symbol);
  }, [chartId, instances, persistenceKey, symbol]);

  /** Add a new indicator instance */
  const addIndicator = useCallback(
    (name: string, range?: AnchoredIndicatorRange) => {
      const chart = chartRef.current;
      if (!chart) return;

      const isAnchored = RANGE_INDICATORS.has(name);
      if (isAnchored && !range) return;

      const uniqueId = `${name.toLowerCase()}_${Date.now()}_${indicatorIdSequence++}`;
      const color = nextColor();
      const isOsc = isOscillatorIndicator(name);
      const isMergeable = MERGEABLE_OVERLAYS.has(name);

      // For mergeable overlays, each instance = one period
      // For others, use the full default params
      const calcParams = isAnchored && range
        ? name === 'AVWAP'
          ? [range.startTimestamp, range.endTimestamp]
          : [range.startTimestamp, range.endTimestamp, 120, 15, 70]
        : isMergeable
        ? [DEFAULT_INDICATOR_PARAMS[name]?.[0] ?? 14]
        : [...(DEFAULT_INDICATOR_PARAMS[name] || [])];

      let paneId: string;

      if (isOsc) {
        // Oscillators get their own pane
        const returned = chart.createIndicator(
          { name, calcParams },
          false,
          { id: uniqueId },
        );
        paneId = returned ?? uniqueId;

        // Apply color
        const rgba = hexToRgba(color, 1);
        requestAnimationFrame(() => {
          chartRef.current?.overrideIndicator(
            { name, styles: { lines: [{ size: 2, style: LineType.Solid, smooth: false, dashedValue: [2, 2], color: rgba }] } },
            paneId,
          );
        });
      } else if (isMergeable) {
        paneId = 'candle_pane';
        // Sync will be called after state update below
      } else {
        // Non-mergeable overlays — stack on candle_pane
        paneId = 'candle_pane';
        const engineName = isAnchored
          ? getAnchoredIndicatorEngineName(name as 'AVWAP' | 'AVP', uniqueId)
          : name;
        if (isAnchored) registerAnchoredIndicatorInstance(name as 'AVWAP' | 'AVP', engineName);
        chart.createIndicator({ name: engineName, calcParams }, true, { id: 'candle_pane' });
        const rgba = hexToRgba(color, 1);
        requestAnimationFrame(() => {
          chartRef.current?.overrideIndicator(
            { name: engineName, styles: { lines: [{ size: 2, style: LineType.Solid, smooth: false, dashedValue: [2, 2], color: rgba }] } },
            'candle_pane',
          );
        });
      }

      const instance: IndicatorInstance = {
        id: uniqueId,
        name,
        calcParams,
        color,
        opacity: 1,
        visible: true,
        paneId,
        rangeOverlayId: range?.overlayId,
        anchorStartTimestamp: range?.startTimestamp,
        anchorEndTimestamp: range?.endTimestamp,
      };

      const newInstances = [...instances, instance];
      setInstances(newInstances);
      setEditingInstanceId(uniqueId);
      setShowAddMenu(false);

      // Sync mergeable overlays after adding
      if (isMergeable) {
        syncOverlay(chart, name, newInstances);
      }
      if (range) {
        chart.overrideOverlay({
          id: range.overlayId,
          extendData: {
            label: name === 'AVWAP' ? 'Anchored VWAP range' : 'Anchored Volume Profile range',
            color,
          },
        });
      }
      return instance;
    },
    [chartRef, nextColor, instances, syncOverlay],
  );

  /** Remove an indicator instance */
  const removeIndicator = useCallback(
    (id: string) => {
      const chart = chartRef.current;
      if (!chart) return;

      const instance = instances.find(i => i.id === id);
      if (!instance) return;

      const newInstances = instances.filter(i => i.id !== id);

      if (isOscillatorIndicator(instance.name)) {
        chart.removeIndicator(instance.paneId, instance.name);
      } else if (MERGEABLE_OVERLAYS.has(instance.name)) {
        // Re-sync remaining instances of same type
        syncOverlay(chart, instance.name, newInstances);
      } else {
        // Non-mergeable overlay (BOLL, AVWAP, or AVP)
        chart.removeIndicator('candle_pane', getIndicatorEngineName(instance));
      }
      if (RANGE_INDICATORS.has(instance.name)) {
        chart.removeOverlay({ id: getRangeOverlayId(instance) });
      }

      setInstances(newInstances);
      if (editingInstanceId === id) setEditingInstanceId(null);
    },
    [chartRef, instances, editingInstanceId, syncOverlay],
  );

  /** Update properties of an indicator instance */
  const updateInstance = useCallback(
    (id: string, changes: Partial<Pick<IndicatorInstance, 'calcParams' | 'color' | 'opacity'>>) => {
      const chart = chartRef.current;
      if (!chart) return;

      const newInstances = instances.map(inst => {
        if (inst.id !== id) return inst;
        return { ...inst, ...changes };
      });

      setInstances(newInstances);

      const updated = newInstances.find(i => i.id === id);
      if (!updated) return;

      if (MERGEABLE_OVERLAYS.has(updated.name)) {
        syncOverlay(chart, updated.name, newInstances);
      } else if (isOscillatorIndicator(updated.name)) {
        if (changes.calcParams) {
          chart.overrideIndicator(
            { name: updated.name, calcParams: updated.calcParams },
            updated.paneId,
          );
        }
        if (changes.color !== undefined || changes.opacity !== undefined) {
          const rgba = hexToRgba(updated.color, updated.opacity);
          chart.overrideIndicator(
            { name: updated.name, styles: { lines: [{ size: 2, style: LineType.Solid, smooth: false, dashedValue: [2, 2], color: rgba }] } },
            updated.paneId,
          );
        }
      } else {
        // Non-mergeable overlay
        if (changes.calcParams) {
          chart.overrideIndicator(
            { name: getIndicatorEngineName(updated), calcParams: updated.calcParams },
            'candle_pane',
          );
        }
        if (changes.color !== undefined || changes.opacity !== undefined) {
          const rgba = hexToRgba(updated.color, updated.opacity);
          chart.overrideIndicator(
            { name: getIndicatorEngineName(updated), styles: { lines: [{ size: 2, style: LineType.Solid, smooth: false, dashedValue: [2, 2], color: rgba }] } },
            'candle_pane',
          );
        }
      }
      if (RANGE_INDICATORS.has(updated.name) && (changes.color !== undefined || changes.opacity !== undefined)) {
        chart.overrideOverlay({
          id: getRangeOverlayId(updated),
          extendData: {
            label: updated.name === 'AVWAP' ? 'Anchored VWAP range' : 'Anchored Volume Profile range',
            color: updated.color,
          },
        });
      }
    },
    [chartRef, instances, syncOverlay],
  );

  /** Toggle visibility of an indicator instance */
  const toggleVisibility = useCallback(
    (id: string) => {
      const chart = chartRef.current;
      if (!chart) return;

      const instance = instances.find(i => i.id === id);
      if (!instance) return;

      const nowVisible = !instance.visible;
      const newInstances = instances.map(i =>
        i.id === id ? { ...i, visible: nowVisible } : i,
      );

      setInstances(newInstances);

      if (MERGEABLE_OVERLAYS.has(instance.name)) {
        syncOverlay(chart, instance.name, newInstances);
      } else if (isOscillatorIndicator(instance.name)) {
        chart.overrideIndicator(
          { name: instance.name, visible: nowVisible },
          instance.paneId,
        );
      } else {
        // Non-mergeable overlay — toggle via visible flag
        chart.overrideIndicator(
          { name: getIndicatorEngineName(instance), visible: nowVisible },
          'candle_pane',
        );
      }
      if (RANGE_INDICATORS.has(instance.name)) {
        chart.overrideOverlay({ id: getRangeOverlayId(instance), visible: nowVisible });
      }
    },
    [chartRef, instances, syncOverlay],
  );

  const editingInstance = instances.find(i => i.id === editingInstanceId) ?? null;

  return {
    indicatorsList: INDICATORS_LIST,
    instances,
    addIndicator,
    removeIndicator,
    updateInstance,
    updateAnchoredRange,
    toggleVisibility,
    showAddMenu,
    setShowAddMenu,
    editingInstance,
    setEditingInstanceId,
  };
}
