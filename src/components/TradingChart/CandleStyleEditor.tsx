import { useEffect, useRef, type ReactNode } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { useChartStyleStore } from '../../store/useChartStyleStore';
import type { DaySeparatorLineStyle } from '../../lib/chart/indicators/daySeparators';

interface CandleStyleEditorProps {
  onClose: () => void;
}

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Australia/Sydney',
];

function availableTimezones(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
  const zones = supported && supported.length > 0 ? supported : COMMON_TIMEZONES;
  return zones.filter(zone => zone !== 'UTC');
}

const LOCAL_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const TIMEZONES = availableTimezones();

const INPUT_CLASS = 'rounded bg-dark-700 border border-dark-600 px-1.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-primary-500';

function Section({ title, titleClass, children }: { title: string; titleClass: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className={`text-xs font-semibold uppercase tracking-wider ${titleClass}`}>{title}</div>
      {children}
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-10 h-6 cursor-pointer rounded bg-dark-700 border border-dark-600 shrink-0"
      />
      <span className="text-xs text-slate-400">{label}</span>
    </label>
  );
}

function Divider() {
  return <div className="h-px bg-dark-700" />;
}

export function CandleStyleEditor({ onClose }: CandleStyleEditorProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const style = useChartStyleStore();
  const { setColors, setDaySeparator, daySeparator } = style;

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
      className="absolute top-4 right-4 bg-dark-800 border border-dark-700 rounded-lg p-4 shadow-2xl z-50 w-64 max-h-[calc(100%-2rem)] overflow-y-auto custom-scrollbar text-sm"
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-slate-200">Candle Properties</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors" aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <Section title="Bullish Candle" titleClass="text-emerald-400">
          {/* The body color also sets border and wick; they can be tuned after. */}
          <ColorRow label="Body Color" value={style.upColor} onChange={color => setColors({ upColor: color, upBorderColor: color, upWickColor: color })} />
          <ColorRow label="Border Color" value={style.upBorderColor} onChange={color => setColors({ upBorderColor: color })} />
          <ColorRow label="Wick Color" value={style.upWickColor} onChange={color => setColors({ upWickColor: color })} />
        </Section>

        <Divider />

        <Section title="Bearish Candle" titleClass="text-red-400">
          <ColorRow label="Body Color" value={style.downColor} onChange={color => setColors({ downColor: color, downBorderColor: color, downWickColor: color })} />
          <ColorRow label="Border Color" value={style.downBorderColor} onChange={color => setColors({ downBorderColor: color })} />
          <ColorRow label="Wick Color" value={style.downWickColor} onChange={color => setColors({ downWickColor: color })} />
        </Section>

        <Divider />

        <Section title="Chart Settings" titleClass="text-primary-400">
          <ColorRow label="Background Color" value={style.backgroundColor} onChange={color => setColors({ backgroundColor: color })} />
        </Section>

        <Divider />

        <Section title="Day Separators" titleClass="text-slate-300">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={daySeparator.enabled}
              onChange={e => setDaySeparator({ enabled: e.target.checked })}
              className="accent-primary-500"
            />
            Show a line where each day starts
          </label>

          {daySeparator.enabled && (
            <>
              <ColorRow label="Line Color" value={daySeparator.color} onChange={color => setDaySeparator({ color })} />

              <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
                Style
                <select
                  value={daySeparator.lineStyle}
                  onChange={e => setDaySeparator({ lineStyle: e.target.value as DaySeparatorLineStyle })}
                  className={INPUT_CLASS}
                >
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                  <option value="solid">Solid</option>
                </select>
              </label>

              <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
                Opacity
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={daySeparator.opacity}
                  onChange={e => setDaySeparator({ opacity: Number(e.target.value) })}
                  className="w-28 accent-primary-500"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Day starts in timezone
                <select
                  value={daySeparator.timezone}
                  onChange={e => setDaySeparator({ timezone: e.target.value })}
                  className={`${INPUT_CLASS} w-full`}
                >
                  <option value="local">Chart time ({LOCAL_TIMEZONE})</option>
                  <option value="UTC">UTC</option>
                  {TIMEZONES.map(zone => <option key={zone} value={zone}>{zone}</option>)}
                </select>
              </label>

              <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
                Session start
                <input
                  type="time"
                  value={daySeparator.sessionStart}
                  onChange={e => setDaySeparator({ sessionStart: e.target.value || '00:00' })}
                  className={INPUT_CLASS}
                />
              </label>
              <p className="text-[10px] leading-snug text-slate-500">
                E.g. CME futures roll over at 17:00 America/Chicago.
              </p>
            </>
          )}
        </Section>

        <button
          onClick={style.reset}
          className="mt-2 w-full py-1.5 bg-dark-700 text-slate-300 hover:text-white border border-dark-600 rounded text-xs flex items-center justify-center gap-1.5 transition-all hover:bg-dark-600 active:scale-95 cursor-pointer"
        >
          <RotateCcw size={12} />
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
