import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { IndicatorInstance } from '../../types/indicatorTypes';
import { DEFAULT_INDICATOR_PARAMS } from '../../lib/chart/constants';

interface IndicatorPropertiesProps {
  instance: IndicatorInstance;
  onUpdate: (id: string, changes: Partial<Pick<IndicatorInstance, 'calcParams' | 'color' | 'opacity'>>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

/**
 * Popup editor for an individual indicator instance.
 * Shows color, opacity, and parameter controls.
 * Closes when clicking outside.
 */
export function IndicatorProperties({
  instance,
  onUpdate,
  onRemove,
  onClose,
}: IndicatorPropertiesProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  /** Labels for param slots based on indicator type */
  const paramLabels = getParamLabels(instance.name);

  return (
    <div
      ref={panelRef}
      className="absolute top-4 right-4 bg-dark-800 border border-dark-700 rounded-lg shadow-2xl z-50 w-64 overflow-hidden"
    >
      {/* Header */}
      <div className="flex justify-between items-center px-3 py-2.5 border-b border-dark-700">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: instance.color }}
          />
          <h3 className="text-sm font-semibold text-slate-200">
            {instance.name}
          </h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="p-3 flex flex-col gap-3">
        {/* Color */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">Color</label>
          <input
            type="color"
            value={instance.color}
            onChange={e => onUpdate(instance.id, { color: e.target.value })}
            className="w-full h-8 cursor-pointer rounded bg-dark-700 border border-dark-600"
          />
        </div>

        {/* Opacity */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">
            Opacity ({Math.round(instance.opacity * 100)}%)
          </label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={instance.opacity}
            onChange={e => onUpdate(instance.id, { opacity: Number(e.target.value) })}
            className="w-full accent-primary-500"
          />
        </div>

        {/* Parameters */}
        {instance.calcParams.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-400">Parameters</label>
            <div className="flex flex-col gap-1.5">
              {instance.calcParams.map((param, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 min-w-[60px]">
                    {paramLabels[idx] ?? `Param ${idx + 1}`}
                  </span>
                  <input
                    type="number"
                    value={param}
                    min={1}
                    onChange={e => {
                      const newParams = [...instance.calcParams];
                      newParams[idx] = Number(e.target.value);
                      onUpdate(instance.id, { calcParams: newParams });
                    }}
                    className="flex-1 bg-dark-700 border border-dark-600 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-primary-500 transition-colors"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reset params */}
        {DEFAULT_INDICATOR_PARAMS[instance.name] && (
          <button
            onClick={() =>
              onUpdate(instance.id, {
                calcParams: [...DEFAULT_INDICATOR_PARAMS[instance.name]],
              })
            }
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors text-left"
          >
            Reset to defaults
          </button>
        )}

        {/* Remove */}
        <button
          onClick={() => onRemove(instance.id)}
          className="mt-1 w-full py-1.5 bg-danger/20 text-danger border border-danger/30 rounded text-sm hover:bg-danger/30 transition-colors"
        >
          Remove Indicator
        </button>
      </div>
    </div>
  );
}

/** Parameter labels for each indicator type */
function getParamLabels(name: string): string[] {
  const map: Record<string, string[]> = {
    MA: ['Period 1', 'Period 2', 'Period 3', 'Period 4'],
    EMA: ['Period'],
    SMA: ['Period'],
    MACD: ['Fast', 'Slow', 'Signal'],
    VOL: ['MA 1', 'MA 2', 'MA 3'],
    RSI: ['Period 1', 'Period 2', 'Period 3'],
    BOLL: ['Period'],
  };
  return map[name] ?? [];
}
