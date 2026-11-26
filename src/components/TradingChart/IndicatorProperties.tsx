import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { IndicatorChanges, IndicatorInstance } from '../../types/indicatorTypes';
import { getCustomIndicator } from '../../lib/chart/customIndicators';
import { IndicatorAppearanceFields } from './IndicatorAppearanceFields';
import { IndicatorParameterFields } from './IndicatorParameterFields';

interface IndicatorPropertiesProps {
  instance: IndicatorInstance;
  onUpdate: (id: string, changes: IndicatorChanges) => void;
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

  const definition = getCustomIndicator(instance.name);
  const update = (changes: IndicatorChanges) => onUpdate(instance.id, changes);

  return (
    <div
      ref={panelRef}
      className="absolute top-4 right-4 bg-dark-800 border border-dark-700 rounded-lg shadow-2xl z-50 w-64 max-h-[calc(100%-2rem)] overflow-y-auto"
    >
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
        <button aria-label="Close indicator properties" onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="p-3 flex flex-col gap-3">
        <IndicatorAppearanceFields instance={instance} definition={definition} onChange={update} />
        <IndicatorParameterFields instance={instance} definition={definition} onChange={calcParams => update({ calcParams })} />
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
