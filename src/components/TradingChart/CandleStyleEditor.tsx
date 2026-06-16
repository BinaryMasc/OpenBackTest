import { useEffect, useRef } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { useChartStyleStore } from '../../store/useChartStyleStore';

interface CandleStyleEditorProps {
  onClose: () => void;
}

export function CandleStyleEditor({ onClose }: CandleStyleEditorProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  
  const {
    upColor,
    downColor,
    upBorderColor,
    downBorderColor,
    upWickColor,
    downWickColor,
    backgroundColor,
    setColors,
    reset,
  } = useChartStyleStore();

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    // Delay to prevent immediate close from the click/double-click that triggered the editor
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
      ref={panelRef}
      className="absolute top-4 right-4 bg-dark-800 border border-dark-700 rounded-lg p-4 shadow-2xl z-50 w-64 text-sm"
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-slate-200">Candle Properties</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {/* Bullish (Up) Candle settings */}
        <div className="space-y-2.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Bullish Candle</div>
          
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={upColor}
              onChange={e => {
                const val = e.target.value;
                setColors({
                  upColor: val,
                  upBorderColor: val,
                  upWickColor: val,
                });
              }}
              className="w-10 h-6 cursor-pointer rounded bg-dark-700 border border-dark-600 shrink-0"
            />
            <span className="text-xs text-slate-400">Body Color</span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="color"
              value={upBorderColor}
              onChange={e => setColors({ upBorderColor: e.target.value })}
              className="w-10 h-6 cursor-pointer rounded bg-dark-700 border border-dark-600 shrink-0"
            />
            <span className="text-xs text-slate-400">Border Color</span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="color"
              value={upWickColor}
              onChange={e => setColors({ upWickColor: e.target.value })}
              className="w-10 h-6 cursor-pointer rounded bg-dark-700 border border-dark-600 shrink-0"
            />
            <span className="text-xs text-slate-400">Wick Color</span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-dark-700" />

        {/* Bearish (Down) Candle settings */}
        <div className="space-y-2.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-red-400">Bearish Candle</div>
          
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={downColor}
              onChange={e => {
                const val = e.target.value;
                setColors({
                  downColor: val,
                  downBorderColor: val,
                  downWickColor: val,
                });
              }}
              className="w-10 h-6 cursor-pointer rounded bg-dark-700 border border-dark-600 shrink-0"
            />
            <span className="text-xs text-slate-400">Body Color</span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="color"
              value={downBorderColor}
              onChange={e => setColors({ downBorderColor: e.target.value })}
              className="w-10 h-6 cursor-pointer rounded bg-dark-700 border border-dark-600 shrink-0"
            />
            <span className="text-xs text-slate-400">Border Color</span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="color"
              value={downWickColor}
              onChange={e => setColors({ downWickColor: e.target.value })}
              className="w-10 h-6 cursor-pointer rounded bg-dark-700 border border-dark-600 shrink-0"
            />
            <span className="text-xs text-slate-400">Wick Color</span>
          </div>
        </div>
        {/* Divider */}
        <div className="h-px bg-dark-700" />

        {/* Chart Background settings */}
        <div className="space-y-2.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-primary-400">Chart Settings</div>
          
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={backgroundColor}
              onChange={e => setColors({ backgroundColor: e.target.value })}
              className="w-10 h-6 cursor-pointer rounded bg-dark-700 border border-dark-600 shrink-0"
            />
            <span className="text-xs text-slate-400">Background Color</span>
          </div>
        </div>

        {/* Actions */}
        <button
          onClick={reset}
          className="mt-2 w-full py-1.5 bg-dark-700 text-slate-300 hover:text-white border border-dark-600 rounded text-xs flex items-center justify-center gap-1.5 transition-all hover:bg-dark-600 active:scale-95 cursor-pointer"
        >
          <RotateCcw size={12} />
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
