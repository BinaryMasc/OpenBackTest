import { useEffect, useRef } from 'react';
import { INDICATORS_LIST } from '../../lib/chart/constants';

interface IndicatorMenuProps {
  onAdd: (name: string) => void;
  onClose: () => void;
}

/**
 * Dropdown menu for picking which indicator type to add.
 * Closes when clicking outside.
 */
export function IndicatorMenu({ onAdd, onClose }: IndicatorMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay binding so the click that opened the menu doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute top-4 left-4 bg-dark-800 border border-dark-700 rounded-lg shadow-2xl z-50 w-56 overflow-hidden"
    >
      <div className="px-3 py-2.5 border-b border-dark-700">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Add Indicator
        </h3>
      </div>
      <div className="py-1 max-h-[60vh] overflow-y-auto">
        {INDICATORS_LIST.map(name => (
          <button
            key={name}
            onClick={() => onAdd(name)}
            className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-primary-500/10 hover:text-primary-500 transition-colors flex items-center gap-2"
          >
            <span className="font-mono text-xs bg-dark-700 px-1.5 py-0.5 rounded text-slate-400">
              {name}
            </span>
            <span className="text-slate-500 text-xs">
              {getIndicatorLabel(name)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Human-friendly label for each indicator type */
function getIndicatorLabel(name: string): string {
  const labels: Record<string, string> = {
    MA: 'Moving Average',
    EMA: 'Exponential MA',
    SMA: 'Simple MA',
    MACD: 'MACD',
    VOL: 'Volume',
    RSI: 'Relative Strength',
    BOLL: 'Bollinger Bands',
  };
  return labels[name] ?? name;
}
