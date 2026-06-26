import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlaybackBar } from '../../src/components/PlaybackBar';
import { useBacktestStore } from '../../src/store/useBacktestStore';

describe('PlaybackBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBacktestStore.setState({
      rawData: [],
      currentIndex: 0,
      isPlaying: false,
    });
  });

  it('does not render when rawData is empty', () => {
    const { container } = render(<PlaybackBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders controls when data is present', () => {
    useBacktestStore.setState({
      rawData: Array.from({ length: 10 }).map((_, i) => ({ time: i, open: 1, high: 2, low: 0, close: 1, volume: 10 })),
      currentIndex: 5,
      isPlaying: false,
    });

    render(<PlaybackBar />);
    expect(screen.getByText('5 / 9')).toBeInTheDocument();
    expect(screen.getByText('Reset')).toBeInTheDocument();
    
    // Check buttons by title
    expect(screen.getByTitle('Rewind (10 ticks)')).toBeInTheDocument();
    expect(screen.getByTitle('Step Backward')).toBeInTheDocument();
    expect(screen.getByTitle('Step Forward')).toBeInTheDocument();
    expect(screen.getByTitle('Fast Forward (10 ticks)')).toBeInTheDocument();
  });

  it('calls store functions on click', () => {
    useBacktestStore.setState({
      rawData: Array.from({ length: 10 }).map((_, i) => ({ time: i, open: 1, high: 2, low: 0, close: 1, volume: 10 })),
      currentIndex: 5,
      isPlaying: false,
    });

    // We can spy on the store methods
    const spyToggle = vi.spyOn(useBacktestStore.getState(), 'togglePlayback');
    const spyStepFwd = vi.spyOn(useBacktestStore.getState(), 'stepForward');
    const spyStepBack = vi.spyOn(useBacktestStore.getState(), 'stepBackward');
    const spyRewind = vi.spyOn(useBacktestStore.getState(), 'rewind');
    const spyFastFwd = vi.spyOn(useBacktestStore.getState(), 'fastForward');
    const spySetIndex = vi.spyOn(useBacktestStore.getState(), 'setCurrentIndex');

    render(<PlaybackBar />);

    // To click play/pause, it's the middle button without a title. We can just click the parent button of the svg
    // A more robust way is to just grab all buttons and click them, or add aria-labels.
    // The play button is the one next to Step Backward
    fireEvent.click(screen.getByTitle('Step Forward'));
    expect(spyStepFwd).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Step Backward'));
    expect(spyStepBack).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Rewind (10 ticks)'));
    expect(spyRewind).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Fast Forward (10 ticks)'));
    expect(spyFastFwd).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Reset'));
    expect(spySetIndex).toHaveBeenCalledWith(0);
    
    // Test the slider
    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '8' } });
    expect(spySetIndex).toHaveBeenCalledWith(8);
  });
});
