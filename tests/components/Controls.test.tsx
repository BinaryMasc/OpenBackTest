import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const { backtestStoreHook, marketDataStoreHook, loadStoredCredentials } = vi.hoisted(() => {
  const backtestStoreHook = Object.assign(vi.fn(), { getState: vi.fn() });
  const marketDataStoreHook = Object.assign(vi.fn(), { getState: vi.fn() });

  return {
    backtestStoreHook,
    marketDataStoreHook,
    loadStoredCredentials: vi.fn()
  };
});

vi.mock('../../src/store/useBacktestStore', () => ({ useBacktestStore: backtestStoreHook }));
vi.mock('../../src/store/useMarketDataStore', () => ({ useMarketDataStore: marketDataStoreHook }));
vi.mock('../../src/components/PlaybackBar', () => ({ PlaybackBar: () => null }));
vi.mock('../../src/components/TradingPanel', () => ({ TradingPanel: () => null }));
vi.mock('../../src/components/ActualAccountPanel', () => ({ ActualAccountPanel: () => null }));
vi.mock('../../src/services/rithmicCredentialStorage', () => ({
  clearStoredRithmicCredentials: vi.fn(),
  loadStoredRithmicCredentials: loadStoredCredentials,
  saveRithmicCredentials: vi.fn()
}));

import { Controls } from '../../src/components/Controls';

describe('Controls mobile sidebar', () => {
  const setMode = vi.fn();

  beforeEach(() => {
    const backtestState = {
      rawData: [],
      currentIndex: -1,
      isPlaying: false,
      playbackSpeed: 500,
      isUploading: false,
      uploadProgress: 0,
      mode: 'playback' as const,
      loadData: vi.fn(),
      setPlaybackSpeed: vi.fn(),
      setUploading: vi.fn(),
      setUploadProgress: vi.fn(),
      setMode,
      togglePlayback: vi.fn(),
      stepForward: vi.fn(),
      importState: vi.fn()
    };
    const marketDataState = {
      sourceId: null,
      isConnected: false,
      isLoading: false,
      sourceName: null,
      error: null,
      connectDefaultSource: vi.fn(),
      connectSource: vi.fn(),
      disconnectSource: vi.fn()
    };

    setMode.mockReset();
    backtestStoreHook.mockReset();
    backtestStoreHook.mockReturnValue(backtestState);
    backtestStoreHook.getState.mockReset();
    backtestStoreHook.getState.mockReturnValue(backtestState);
    marketDataStoreHook.mockReset();
    marketDataStoreHook.mockReturnValue(marketDataState);
    marketDataStoreHook.getState.mockReset();
    marketDataStoreHook.getState.mockReturnValue(marketDataState);
    loadStoredCredentials.mockReset();
    loadStoredCredentials.mockResolvedValue(null);
  });

  it('opens, closes, and exposes an accessible mobile navigation toggle', () => {
    render(<Controls />);

    const menuToggle = screen.getByRole('button', { name: 'Open trading controls menu' });
    const sidebar = screen.getByRole('complementary', { name: 'Trading controls' });

    expect(menuToggle).toHaveAttribute('aria-controls', 'trading-controls-sidebar');
    expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
    expect(sidebar).toHaveClass('fixed', 'md:static', '-translate-x-full', 'invisible');

    fireEvent.click(menuToggle);

    expect(screen.getByRole('button', { name: 'Close trading controls menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(sidebar).toHaveClass('translate-x-0', 'visible');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'Open trading controls menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(sidebar).toHaveClass('-translate-x-full', 'invisible');
  });

  it('closes the drawer when a mode is selected', () => {
    render(<Controls />);

    fireEvent.click(screen.getByRole('button', { name: 'Open trading controls menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simulation' }));

    expect(setMode).toHaveBeenCalledWith('simulation');
    expect(screen.getByRole('button', { name: 'Open trading controls menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('retracts the drawer before opening the Rithmic dialog', () => {
    render(<Controls />);

    fireEvent.click(screen.getByRole('button', { name: 'Open trading controls menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect with Rithmic credentials' }));

    expect(screen.getByRole('button', { name: 'Open trading controls menu' })).toHaveAttribute('aria-expanded', 'false');
    const dialog = screen.getByRole('dialog', { name: 'Connect to Rithmic' });
    expect(dialog.parentElement).toHaveClass('z-[130]');
  });

  it('cancels an in-flight Rithmic connection when the dialog is closed', () => {
    const { rerender } = render(<Controls />);
    const marketDataState = marketDataStoreHook.mock.results.at(-1)?.value as {
      sourceId: string | null;
      isLoading: boolean;
      disconnectSource: ReturnType<typeof vi.fn>;
    };

    fireEvent.click(screen.getByRole('button', { name: 'Connect with Rithmic credentials' }));
    marketDataState.sourceId = 'rithmic';
    marketDataState.isLoading = true;
    rerender(<Controls />);

    expect(screen.getByRole('status')).toHaveTextContent('Signing in and loading symbol data');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(marketDataState.disconnectSource).toHaveBeenCalledOnce();
  });
});
