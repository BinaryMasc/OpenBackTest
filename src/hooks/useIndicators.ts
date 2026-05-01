import { useState, useCallback, useRef } from 'react';
import type { Chart } from 'klinecharts';
import type { IndicatorInstance } from '../types/indicatorTypes';
import {
  DEFAULT_INDICATOR_PARAMS,
  INDICATORS_LIST,
  INDICATOR_DEFAULT_COLORS,
} from '../lib/chart/constants';
import { isOscillatorIndicator } from '../lib/chart/utils';
import { hexToRgba } from '../lib/chart/utils';

/**
 * Overlay indicators where each calcParam = one independent line.
 * Multiple instances are merged into a single klinecharts indicator
 * with combined calcParams and per-line styles.
 */
const MERGEABLE_OVERLAYS = new Set(['MA', 'EMA', 'SMA']);

export function useIndicators(chartRef: React.RefObject<Chart | null>) {
  const [instances, setInstances] = useState<IndicatorInstance[]>([]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const colorIndexRef = useRef(0);

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
          style: 'solid' as const,
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

  /** Add a new indicator instance */
  const addIndicator = useCallback(
    (name: string) => {
      const chart = chartRef.current;
      if (!chart) return;

      const uniqueId = `${name.toLowerCase()}_${Date.now()}`;
      const color = nextColor();
      const isOsc = isOscillatorIndicator(name);
      const isMergeable = MERGEABLE_OVERLAYS.has(name);

      // For mergeable overlays, each instance = one period
      // For others, use the full default params
      const calcParams = isMergeable
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
            { name, styles: { lines: [{ size: 2, style: 'solid' as const, dashedValue: [2, 2], color: rgba }] } },
            paneId,
          );
        });
      } else if (isMergeable) {
        paneId = 'candle_pane';
        // Sync will be called after state update below
      } else {
        // Non-mergeable overlay (BOLL) — stack on candle_pane
        paneId = 'candle_pane';
        chart.createIndicator({ name, calcParams }, true, { id: 'candle_pane' });
        const rgba = hexToRgba(color, 1);
        requestAnimationFrame(() => {
          chartRef.current?.overrideIndicator(
            { name, styles: { lines: [{ size: 2, style: 'solid' as const, dashedValue: [2, 2], color: rgba }] } },
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
      };

      const newInstances = [...instances, instance];
      setInstances(newInstances);
      setEditingInstanceId(uniqueId);
      setShowAddMenu(false);

      // Sync mergeable overlays after adding
      if (isMergeable) {
        syncOverlay(chart, name, newInstances);
      }
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
        // Non-mergeable overlay (BOLL)
        chart.removeIndicator('candle_pane', instance.name);
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
            { name: updated.name, styles: { lines: [{ size: 2, style: 'solid' as const, dashedValue: [2, 2], color: rgba }] } },
            updated.paneId,
          );
        }
      } else {
        // Non-mergeable overlay
        if (changes.calcParams) {
          chart.overrideIndicator(
            { name: updated.name, calcParams: updated.calcParams },
            'candle_pane',
          );
        }
        if (changes.color !== undefined || changes.opacity !== undefined) {
          const rgba = hexToRgba(updated.color, updated.opacity);
          chart.overrideIndicator(
            { name: updated.name, styles: { lines: [{ size: 2, style: 'solid' as const, dashedValue: [2, 2], color: rgba }] } },
            'candle_pane',
          );
        }
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
          { name: instance.name, visible: nowVisible },
          'candle_pane',
        );
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
    toggleVisibility,
    showAddMenu,
    setShowAddMenu,
    editingInstance,
    setEditingInstanceId,
  };
}
