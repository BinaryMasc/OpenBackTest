import { useBacktestStore } from '../../store/useBacktestStore';

const localDateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' });

/** Isolated so only this small box re-renders on every playback tick. */
export function CurrentTickTime() {
  const time = useBacktestStore(state => state.rawData[state.currentIndex]?.time);
  const label = time !== undefined
    ? localDateTime.format(time * 1000)
    : 'No Data';

  return (
    <div className="bg-dark-900 p-3 rounded-lg border border-dark-700">
      <div className="text-slate-400 text-xs mb-1">Current Tick Time</div>
      <div className="font-mono text-emerald-400">{label}</div>
    </div>
  );
}
