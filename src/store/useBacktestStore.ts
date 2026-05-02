import { create } from 'zustand';
import type { Candle, Timeframe } from '../types';


interface BacktestState {
  rawData: Candle[];
  symbol: string;
  currentIndex: number;
  timeframe: Timeframe;
  isPlaying: boolean;
  playbackSpeed: number; // ms per tick
  isUploading: boolean;
  uploadProgress: number; // 0-100
  mode: 'playback' | 'simulation';

  loadData: (data: Candle[], symbol?: string) => void;
  setUploading: (uploading: boolean) => void;
  setUploadProgress: (progress: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  setTimeframe: (tf: Timeframe) => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setCurrentIndex: (index: number) => void;
  rewind: () => void;
  fastForward: () => void;
  setMode: (mode: 'playback' | 'simulation') => void;
  getCurrentTickTime: () => number | null;
}

export const useBacktestStore = create<BacktestState>((set, get) => ({
  rawData: [],
  symbol: '',
  currentIndex: -1,
  timeframe: '1m',
  isPlaying: false,
  playbackSpeed: 500,
  isUploading: false,
  uploadProgress: 0,
  mode: 'playback',

  loadData: (data: Candle[], symbol?: string) => set({ 
    rawData: data, 
    symbol: symbol ?? '',
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

  setCurrentIndex: (index: number) => set((state) => ({
    currentIndex: Math.max(0, Math.min(index, state.rawData.length - 1))
  })),

  rewind: () => set((state) => ({
    currentIndex: Math.max(state.currentIndex - 10, 0)
  })),

  fastForward: () => set((state) => ({
    currentIndex: Math.min(state.currentIndex + 10, state.rawData.length - 1)
  })),

  setMode: (mode: 'playback' | 'simulation') => set({ mode }),

  getCurrentTickTime: () => {
    const { rawData, currentIndex } = get();
    if (rawData.length === 0 || currentIndex === -1) return null;
    return rawData[currentIndex].time;
  }
}));
