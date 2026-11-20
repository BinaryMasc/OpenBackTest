import { useBacktestStore } from '../../store/useBacktestStore';

/** Isolated so only this small box re-renders on every playback tick. */
export function CurrentTickTime() {
  const time = useBacktestStore(state => state.rawData[state.currentIndex]?.time);
  const label = time !== undefined
    ? new Date(time * 1000).toISOString().replace('T', ' ').substring(0, 19)
    : 'No Data';

  return (
    <div className="bg-dark-900 p-3 rounded-lg border border-dark-700">
      <div className="text-slate-400 text-xs mb-1">Current Tick Time</div>
      <div className="font-mono text-emerald-400">{label}</div>
    </div>
  );
}
