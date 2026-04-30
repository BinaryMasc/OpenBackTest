import { create } from 'zustand';
import type { Candle, Timeframe } from '../types';
import { aggregateCandles } from '../utils/aggregation';

interface BacktestState {
  rawData: Candle[];
  currentIndex: number;
  timeframe: Timeframe;
  isPlaying: boolean;
  playbackSpeed: number; // ms per tick

  loadData: (data: Candle[]) => void;
  stepForward: () => void;
  stepBackward: () => void;
  setTimeframe: (tf: Timeframe) => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
  getCurrentTickTime: () => number | null;
}

export const useBacktestStore = create<BacktestState>((set, get) => ({
  rawData: [],
  currentIndex: -1,
  timeframe: '1m',
  isPlaying: false,
  playbackSpeed: 500,

  loadData: (data: Candle[]) => set({ 
    rawData: data, 
    currentIndex: Math.min(100, data.length - 1), // Start with some initial history
    isPlaying: false 
  }),

  stepForward: () => set((state) => ({
    currentIndex: Math.min(state.currentIndex + 1, state.rawData.length - 1)
  })),

  stepBackward: () => set((state) => ({
    currentIndex: Math.max(state.currentIndex - 1, 0)
  })),

  setTimeframe: (tf: Timeframe) => set({ timeframe: tf }),

  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setPlaybackSpeed: (speed: number) => set({ playbackSpeed: speed }),

  getCurrentTickTime: () => {
    const { rawData, currentIndex } = get();
    if (rawData.length === 0 || currentIndex === -1) return null;
    return rawData[currentIndex].time;
  }
}));
