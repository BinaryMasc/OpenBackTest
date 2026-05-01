import { create } from 'zustand';
import type { Candle, Timeframe } from '../types';


interface BacktestState {
  rawData: Candle[];
  currentIndex: number;
  timeframe: Timeframe;
  isPlaying: boolean;
  playbackSpeed: number; // ms per tick
  isUploading: boolean;
  uploadProgress: number; // 0-100

  loadData: (data: Candle[]) => void;
  setUploading: (uploading: boolean) => void;
  setUploadProgress: (progress: number) => void;
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
  isUploading: false,
  uploadProgress: 0,

  loadData: (data: Candle[]) => set({ 
    rawData: data, 
    currentIndex: Math.min(100, data.length - 1),
    isPlaying: false,
    isUploading: false,
    uploadProgress: 0
  }),

  setUploading: (uploading: boolean) => set({ isUploading: uploading }),
  setUploadProgress: (progress: number) => set({ uploadProgress: progress }),

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
