import { useEffect } from 'react';
import { useBacktestStore } from '../store/useBacktestStore';

/** Advances playback one candle per `playbackSpeed` ms and stops at the end. */
export function usePlaybackTimer(): void {
  const isPlaying = useBacktestStore(state => state.isPlaying);
  const playbackSpeed = useBacktestStore(state => state.playbackSpeed);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      const { currentIndex, rawData, togglePlayback, stepForward } = useBacktestStore.getState();
      if (currentIndex >= rawData.length - 1) {
        togglePlayback();
      } else {
        stepForward();
      }
    }, playbackSpeed);
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed]);
}
