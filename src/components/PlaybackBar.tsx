import { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FastForward as FastForwardIcon,
  Rewind as RewindIcon
} from 'lucide-react';
import { useBacktestStore } from '../store/useBacktestStore';

const STEP_BUTTON = 'p-1.5 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-white transition-all';

function formatCandleTime(seconds: number | undefined): string {
  if (seconds === undefined) return '';
  return new Date(seconds * 1000).toISOString().replace('T', ' ').substring(0, 16);
}

export function PlaybackBar() {
  const candleCount = useBacktestStore(state => state.rawData.length);
  const currentIndex = useBacktestStore(state => state.currentIndex);
  const isPlaying = useBacktestStore(state => state.isPlaying);
  const togglePlayback = useBacktestStore(state => state.togglePlayback);
  const stepForward = useBacktestStore(state => state.stepForward);
  const stepBackward = useBacktestStore(state => state.stepBackward);
  const rewind = useBacktestStore(state => state.rewind);
  const fastForward = useBacktestStore(state => state.fastForward);
  const setCurrentIndex = useBacktestStore(state => state.setCurrentIndex);

  // While the thumb is dragged only the bar and its date label follow the
  // pointer; the chart jumps once on release. Reloading a multi-year chart on
  // every pointer move would make dragging unusable.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragRef = useRef<{ active: boolean; index: number | null; end: (() => void) | null }>({
    active: false,
    index: null,
    end: null,
  });
  const displayIndex = dragIndex ?? currentIndex;
  const displayTime = useBacktestStore(state => state.rawData[displayIndex]?.time);

  useEffect(() => {
    const drag = dragRef.current;
    return () => drag.end?.();
  }, []);

  if (candleCount === 0) return null;

  const lastIndex = candleCount - 1;
  const progress = lastIndex > 0 ? (Math.max(0, displayIndex) / lastIndex) * 100 : 100;
  const dateLabel = formatCandleTime(displayTime);

  // Listen on window: the pointer is often released outside the slider.
  const startDrag = () => {
    const drag = dragRef.current;
    drag.end?.();
    const end = () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const index = drag.index;
      drag.active = false;
      drag.index = null;
      drag.end = null;
      setDragIndex(null);
      if (index !== null) setCurrentIndex(index);
    };
    drag.active = true;
    drag.end = end;
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const index = parseInt(e.target.value);
    if (dragRef.current.active) {
      dragRef.current.index = index;
      setDragIndex(index);
    } else {
      setCurrentIndex(index);
    }
  };

  return (
    <div className="w-full flex flex-col gap-4 py-2">
      {/* Progress slider: the native input handles interaction and keyboard
          access; the solid track, fill and thumb below are its visual. */}
      <div className="relative w-full h-5 group flex items-center">
        <div className="absolute inset-x-0 h-1.5 bg-dark-700 rounded-full overflow-hidden">
          <div className="h-full bg-primary-500" style={{ width: `${progress}%` }} />
        </div>
        <div
          className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary-500 shadow-md shadow-black/40 transition-transform group-hover:scale-125"
          style={{ left: `${progress}%` }}
        />
        {dragIndex !== null && (
          <div
            className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-dark-600 bg-dark-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-200 shadow-lg"
            style={{ left: `clamp(3rem, ${progress}%, calc(100% - 3rem))` }}
          >
            {dateLabel}
          </div>
        )}
        <input
          type="range"
          min="0"
          max={lastIndex}
          value={displayIndex}
          onChange={handleSliderChange}
          onPointerDown={startDrag}
          aria-label="Playback position"
          aria-valuetext={dateLabel}
          className="relative z-10 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      {/* Progress Info */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono text-slate-500">
          {displayIndex} / {lastIndex}
        </span>
        <span className="truncate text-[10px] font-mono text-slate-400">{dateLabel}</span>
        <button
          onClick={() => setCurrentIndex(0)}
          className="text-[10px] text-slate-500 hover:text-white flex items-center gap-1 transition-colors"
        >
          <RotateCcw size={10} />
          Reset
        </button>
      </div>

      {/* Controls Row */}
      <div className="flex items-center justify-center gap-2">
        <button onClick={rewind} className={STEP_BUTTON} title="Rewind (10 ticks)">
          <RewindIcon size={16} />
        </button>

        <button onClick={stepBackward} className={STEP_BUTTON} title="Step Backward">
          <ChevronLeft size={20} />
        </button>

        <button
          onClick={togglePlayback}
          title={isPlaying ? 'Pause' : 'Play'}
          className={`p-2.5 rounded-full flex items-center justify-center transition-all ${
            isPlaying
              ? 'bg-danger/20 text-danger hover:bg-danger/30'
              : 'bg-primary-500/20 text-primary-500 hover:bg-primary-500/30'
          }`}
        >
          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
        </button>

        <button onClick={stepForward} className={STEP_BUTTON} title="Step Forward">
          <ChevronRight size={20} />
        </button>

        <button onClick={fastForward} className={STEP_BUTTON} title="Fast Forward (10 ticks)">
          <FastForwardIcon size={16} />
        </button>
      </div>
    </div>
  );
}
