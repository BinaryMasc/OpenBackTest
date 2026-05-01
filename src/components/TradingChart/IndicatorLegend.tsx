import { X, Eye, EyeOff } from 'lucide-react';
import type { IndicatorInstance } from '../../types/indicatorTypes';

interface IndicatorLegendProps {
  instances: IndicatorInstance[];
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleVisibility: (id: string) => void;
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
  if (instances.length === 0) return null;

  return (
    <div className="absolute top-2 left-2 z-40 flex flex-col gap-1 pointer-events-auto max-w-[280px]">
      {instances.map(inst => (
        <div
          key={inst.id}
          className="group flex items-center gap-1.5 bg-dark-800/90 backdrop-blur-sm border border-dark-700/50 rounded px-2 py-1 text-xs transition-all hover:border-dark-600"
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
            <span className="text-slate-500">
              ({inst.calcParams.join(', ')})
            </span>
          </button>

          {/* Visibility toggle */}
          <button
            onClick={() => onToggleVisibility(inst.id)}
            className="ml-auto text-slate-500 hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100"
            title={inst.visible ? 'Hide' : 'Show'}
          >
            {inst.visible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>

          {/* Remove button */}
          <button
            onClick={() => onRemove(inst.id)}
            className="text-slate-500 hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
            title="Remove"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
