import React from 'react';
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

export function PlaybackBar() {
  const { 
    rawData, 
    currentIndex, 
    isPlaying, 
    togglePlayback, 
    stepForward, 
    stepBackward,
    rewind,
    fastForward,
    setCurrentIndex
  } = useBacktestStore();

  if (rawData.length === 0) return null;

  const progress = (currentIndex / (rawData.length - 1)) * 100;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentIndex(parseInt(e.target.value));
  };

  return (
    <div className="w-full flex flex-col gap-4 py-2">
      {/* Progress Slider */}
      <div className="relative w-full h-4 group flex items-center">
        <div className="absolute w-full h-1 bg-dark-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary-500 to-primary-300 rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(59,130,246,0.3)]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <input
          type="range"
          min="0"
          max={rawData.length - 1}
          value={currentIndex}
          onChange={handleSliderChange}
          className="relative z-10 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      {/* Progress Info */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-slate-500">
          {currentIndex} / {rawData.length - 1}
        </span>
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
        <button
          onClick={rewind}
          className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-white transition-all"
          title="Rewind (10 ticks)"
        >
          <RewindIcon size={16} />
        </button>
        
        <button
          onClick={stepBackward}
          className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-white transition-all"
          title="Step Backward"
        >
          <ChevronLeft size={20} />
        </button>

        <button
          onClick={togglePlayback}
          className={`p-2.5 rounded-full flex items-center justify-center transition-all ${
            isPlaying 
              ? 'bg-danger/20 text-danger hover:bg-danger/30' 
              : 'bg-primary-500/20 text-primary-500 hover:bg-primary-500/30'
          }`}
        >
          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
        </button>

        <button
          onClick={stepForward}
          className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-white transition-all"
          title="Step Forward"
        >
          <ChevronRight size={20} />
        </button>

        <button
          onClick={fastForward}
          className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-white transition-all"
          title="Fast Forward (10 ticks)"
        >
          <FastForwardIcon size={16} />
        </button>
      </div>
    </div>
  );
}
