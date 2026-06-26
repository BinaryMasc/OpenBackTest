import { describe, it, expect, beforeEach } from 'vitest';
import { useBacktestStore } from '../../src/store/useBacktestStore';
import type { Candle } from '../../src/types';

describe('useBacktestStore', () => {
  beforeEach(() => {
    // Reset state before each test
    useBacktestStore.setState({
      rawData: [],
      symbol: '',
      currentIndex: -1,
      charts: [{ id: 'chart-1', timeframe: '1m' }],
      isPlaying: false,
      playbackSpeed: 500,
      isUploading: false,
      uploadProgress: 0,
      mode: 'playback',
    });
  });

  it('should initialize with default values', () => {
    const state = useBacktestStore.getState();
    expect(state.rawData).toEqual([]);
    expect(state.currentIndex).toBe(-1);
    expect(state.isPlaying).toBe(false);
  });

  it('should load data correctly', () => {
    const mockData: Candle[] = [
      { time: 1000, open: 1, high: 2, low: 0, close: 1.5, volume: 100 },
      { time: 2000, open: 1.5, high: 2.5, low: 1, close: 2, volume: 200 },
    ];

    useBacktestStore.getState().loadData(mockData, 'BTCUSDT');

    const state = useBacktestStore.getState();
    expect(state.rawData).toHaveLength(2);
    expect(state.symbol).toBe('BTCUSDT');
    // It should jump to the last element
    expect(state.currentIndex).toBe(1);
    expect(state.isPlaying).toBe(false);
  });

  it('should handle stepForward and stepBackward', () => {
    const mockData: Candle[] = [
      { time: 1000, open: 1, high: 2, low: 0, close: 1.5, volume: 100 },
      { time: 2000, open: 1.5, high: 2.5, low: 1, close: 2, volume: 200 },
      { time: 3000, open: 2, high: 3, low: 1.5, close: 2.5, volume: 300 },
    ];

    useBacktestStore.getState().loadData(mockData);
    
    // reset index to 0 for testing step
    useBacktestStore.getState().setCurrentIndex(0);
    
    useBacktestStore.getState().stepForward();
    expect(useBacktestStore.getState().currentIndex).toBe(1);
    
    useBacktestStore.getState().stepBackward();
    expect(useBacktestStore.getState().currentIndex).toBe(0);
    
    // Cannot go below 0
    useBacktestStore.getState().stepBackward();
    expect(useBacktestStore.getState().currentIndex).toBe(0);
  });

  it('should toggle playback', () => {
    expect(useBacktestStore.getState().isPlaying).toBe(false);
    useBacktestStore.getState().togglePlayback();
    expect(useBacktestStore.getState().isPlaying).toBe(true);
    useBacktestStore.getState().togglePlayback();
    expect(useBacktestStore.getState().isPlaying).toBe(false);
  });
});
