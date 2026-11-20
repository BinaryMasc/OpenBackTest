import type { ReactNode } from 'react';
import { PlayCircle, ShieldCheck, TrendingUp } from 'lucide-react';
import { useBacktestStore, type BacktestState } from '../../store/useBacktestStore';

type Mode = BacktestState['mode'];

const MODES: Array<{ mode: Mode; label: string; activeClass: string; icon: ReactNode }> = [
  { mode: 'playback', label: 'Playback', activeClass: 'bg-primary-500', icon: <PlayCircle size={10} /> },
  { mode: 'simulation', label: 'Simulation', activeClass: 'bg-emerald-600', icon: <TrendingUp size={10} /> },
  { mode: 'live', label: 'Live', activeClass: 'bg-amber-600', icon: <ShieldCheck size={12} /> },
];

export function ModeSelector() {
  const mode = useBacktestStore(state => state.mode);
  const setMode = useBacktestStore(state => state.setMode);

  return (
    <div className="mb-6 space-y-2">
      <h3 className="text-slate-400 uppercase text-xs font-bold tracking-wider mb-3">Mode</h3>
      <div className="flex bg-dark-900 p-1 rounded-xl border border-dark-700">
        {MODES.map(item => (
          <button
            key={item.mode}
            onClick={() => setMode(item.mode)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${mode === item.mode
              ? `${item.activeClass} text-white shadow-lg`
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
