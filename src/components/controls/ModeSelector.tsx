import { PlayCircle, ShieldCheck, TrendingUp, type LucideIcon } from 'lucide-react';
import { useBacktestStore, type BacktestState } from '../../store/useBacktestStore';
import { SidebarSection } from './SidebarSection';

type ModeOption = {
  mode: BacktestState['mode'];
  label: string;
  icon: LucideIcon;
  selectedStyle: string;
};

const MODES: ModeOption[] = [
  {
    mode: 'playback', label: 'Playback', icon: PlayCircle,
    selectedStyle: 'peer-checked:border-blue-400/60 peer-checked:bg-blue-400/15 peer-checked:text-blue-200',
  },
  {
    mode: 'simulation', label: 'Simulation', icon: TrendingUp,
    selectedStyle: 'peer-checked:border-emerald-400/60 peer-checked:bg-emerald-400/15 peer-checked:text-emerald-200',
  },
  {
    mode: 'live', label: 'Live', icon: ShieldCheck,
    selectedStyle: 'peer-checked:border-amber-400/60 peer-checked:bg-amber-400/15 peer-checked:text-amber-200',
  },
];

export function ModeSelector() {
  const mode = useBacktestStore(state => state.mode);
  const setMode = useBacktestStore(state => state.setMode);

  return (
    <SidebarSection title="Mode" summary={MODES.find(option => option.mode === mode)?.label}>
      <fieldset aria-label="Mode" className="grid min-w-0 grid-cols-3 gap-1 rounded-xl border border-dark-700 bg-dark-900 p-1">
        {MODES.map(({ mode: value, label, icon: Icon, selectedStyle }) => (
          <label key={value} className="relative cursor-pointer">
            <input
              className="peer sr-only"
              type="radio"
              name="trading-mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            <span className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-transparent text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100 peer-checked:font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-white motion-safe:transition-colors ${selectedStyle}`}>
              <Icon size={18} aria-hidden="true" />
              {label}
            </span>
          </label>
        ))}
      </fieldset>
    </SidebarSection>
  );
}
