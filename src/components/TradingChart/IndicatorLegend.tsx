import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, X, Eye, EyeOff } from 'lucide-react';
import type { IndicatorInstance } from '../../types/indicatorTypes';

import { getCustomIndicator } from '../../lib/chart/customIndicators';

interface IndicatorLegendProps {
  instances: IndicatorInstance[];
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}

function formatIndicatorParams(instance: IndicatorInstance): string {
  const format = getCustomIndicator(instance.name)?.formatParams;
  if (format) return format(instance.calcParams);
  if (instance.name === 'AVWAP') return 'range selected';
  if (instance.name === 'AVP' && instance.calcParams.length >= 5) {
    return instance.calcParams.slice(2).join(', ');
  }
  return instance.calcParams.join(', ');
}

/**
 * TradingView-style top-left legend showing all active indicator instances.
 * Each pill displays the indicator name, params summary, and color dot.
 * Click to edit, eye icon to toggle visibility, × to remove.
 */
export function IndicatorLegend({
  instances,
  onSelect,
  onRemove,
  onToggleVisibility,
}: IndicatorLegendProps) {
  const [expanded, setExpanded] = useState(true);
  const listId = useId();
  const toggleLabel = expanded ? 'Collapse indicator list' : 'Expand indicator list';
  if (instances.length === 0) return null;

  return (
    <div className="absolute top-8 left-2 max-h-[calc(100%-2.5rem)] z-40 flex flex-col gap-1 pointer-events-auto max-w-[280px]">
      <ul id={listId} hidden={!expanded} aria-label="Active indicators" className="min-h-0 space-y-1 overflow-y-auto">
        {instances.map(inst => (
          <li
            key={inst.id}
            className="group flex items-center gap-1.5 bg-dark-900/35 hover:bg-dark-800/90 focus-within:bg-dark-800/90 border border-dark-700/50 rounded px-2 py-1 text-xs transition-colors hover:border-slate-600"
          >
            {/* Color dot */}
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                backgroundColor: inst.color,
                opacity: inst.visible ? inst.opacity : 0.3,
              }}
            />

            {/* Name & params — clickable to edit */}
            <button
              onClick={() => onSelect(inst.id)}
              className="flex items-center gap-1 text-slate-300 hover:text-primary-500 transition-colors truncate"
              title="Edit properties"
            >
              <span className="font-medium">{inst.name}</span>
              <span className="text-slate-400">
                ({formatIndicatorParams(inst)})
              </span>
            </button>

            {/* Visibility toggle */}
            <button
              onClick={() => onToggleVisibility(inst.id)}
              className="ml-auto text-slate-500 hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              title={inst.visible ? 'Hide' : 'Show'}
            >
              {inst.visible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>

            {/* Remove button */}
            <button
              onClick={() => onRemove(inst.id)}
              className="text-slate-500 hover:text-danger transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              title="Remove"
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" aria-label={toggleLabel} title={toggleLabel}
        aria-controls={listId} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}
        className="self-start shrink-0 rounded border border-dark-700/50 bg-dark-900/35 px-2 py-1 text-slate-300 hover:bg-dark-800/90 hover:text-white">
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
    </div>
  );
}
