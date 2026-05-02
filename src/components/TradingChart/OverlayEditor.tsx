import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Chart, Overlay } from 'klinecharts';
import { hexToRgba } from '../../lib/chart/utils';
import { getTextContent, setTextContent } from '../../lib/chart/overlays';

interface OverlayEditorProps {
  overlay: Overlay;
  overlayColor: string;
  overlayOpacity: number;
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
  onRemove: () => void;
  onClose: () => void;
  chartRef: React.RefObject<Chart | null>;
}

/**
 * Properties popup for drawing objects (rectangles, lines, etc.).
 * Closes when clicking outside.
 */
export function OverlayEditor({
  overlay,
  overlayColor,
  overlayOpacity,
  onColorChange,
  onOpacityChange,
  onRemove,
  onClose,
  chartRef,
}: OverlayEditorProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay so the click/double-click that opened the panel doesn't close it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  const updateOverlayStyle = (color: string, opacity: number) => {
    const chart = chartRef.current;
    if (!chart || !overlay) return;
    const rgba = hexToRgba(color, opacity);
    const styles: Record<string, unknown> = {
      line: { color: rgba },
      polygon: { color: rgba, borderSize: 1, borderColor: rgba },
      circle: { color: rgba },
    };
    if (overlay.name === 'text') {
      styles.text = { color, size: 12 };
    }
    chart.overrideOverlay({
      id: overlay.id,
      styles,
    });
  };

  return (
    <div
      ref={panelRef}
      className="absolute top-4 right-4 bg-dark-800 border border-dark-700 rounded-lg p-4 shadow-2xl z-50 w-64"
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-slate-200">Object Properties</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">Color</label>
          <input
            type="color"
            value={overlayColor}
            onChange={e => {
              const newColor = e.target.value;
              onColorChange(newColor);
              updateOverlayStyle(newColor, overlayOpacity);
            }}
            className="w-full h-8 cursor-pointer rounded bg-dark-700 border border-dark-600"
          />
        </div>

        <div className="flex flex-col gap-1 mt-2">
          <label className="text-xs text-slate-400">Opacity ({Math.round(overlayOpacity * 100)}%)</label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={overlayOpacity}
            onChange={e => {
              const newOpacity = Number(e.target.value);
              onOpacityChange(newOpacity);
              updateOverlayStyle(overlayColor, newOpacity);
            }}
            className="w-full accent-primary-500"
          />
        </div>

        {overlay.name === 'text' && (
          <div className="flex flex-col gap-1 mt-2">
            <label className="text-xs text-slate-400">Text Content</label>
            <input
              type="text"
              value={getTextContent(overlay.id)}
              onChange={e => {
                const chart = chartRef.current;
                if (!chart) return;
                setTextContent(overlay.id, e.target.value);
                chart.overrideOverlay({
                  id: overlay.id,
                  styles: {
                    text: { color: overlayColor, size: 12 },
                  },
                });
              }}
              className="w-full px-2 py-1 bg-dark-700 border border-dark-600 rounded text-sm text-slate-200 focus:outline-none focus:border-primary-500"
            />
          </div>
        )}

        <button
          onClick={onRemove}
          className="mt-2 w-full py-1.5 bg-danger/20 text-danger border border-danger/30 rounded text-sm hover:bg-danger/30 transition-colors"
        >
          Remove Drawing
        </button>
      </div>
    </div>
  );
}
