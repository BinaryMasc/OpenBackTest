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

describe('Controls sidebar', () => {
  const setMode = vi.fn();
  let marketDataState: {
    sourceId: string | null;
    sourceName: string | null;
    isConnected: boolean;
    isLoading: boolean;
    error: string | null;
    connectDefaultSource: ReturnType<typeof vi.fn>;
    connectSource: ReturnType<typeof vi.fn>;
    disconnectSource: ReturnType<typeof vi.fn>;
  };

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
    marketDataState = {
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
    backtestStoreHook.mockImplementation((selector?: (state: typeof backtestState) => unknown) =>
      selector ? selector(backtestState) : backtestState);
    backtestStoreHook.getState.mockReset();
    backtestStoreHook.getState.mockReturnValue(backtestState);
    marketDataStoreHook.mockReset();
    marketDataStoreHook.mockImplementation((selector?: (state: unknown) => unknown) =>
      selector ? selector(marketDataState) : marketDataState);
    marketDataStoreHook.getState.mockReset();
    marketDataStoreHook.getState.mockReturnValue(marketDataState);
    loadStoredCredentials.mockReset();
    loadStoredCredentials.mockResolvedValue(null);
  });

  it('collapses and restores desktop controls independently of the mobile drawer', () => {
    render(<Controls />);

    const toggle = screen.getByRole('button', { name: 'Collapse trading controls' });
    const sidebar = screen.getByRole('complementary', { name: 'Trading controls' });
    expect(toggle).toHaveAttribute('aria-controls', sidebar.id);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Expand trading controls' })).toHaveAttribute('aria-expanded', 'false');
    expect(sidebar).toHaveClass('md:hidden');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(sidebar).toHaveClass('md:flex');
    expect(screen.getByRole('button', { name: 'Open trading controls menu' })).toHaveAttribute('aria-expanded', 'false');
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
    expect(menuToggle).toHaveFocus();
  });

  it('keeps the drawer open when a mode is selected', () => {
    render(<Controls />);

    fireEvent.click(screen.getByRole('button', { name: 'Open trading controls menu' }));
    expect(screen.getByRole('radio', { name: 'Playback' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Simulation' }));

    expect(setMode).toHaveBeenCalledWith('simulation');
    expect(screen.getByRole('button', { name: 'Close trading controls menu' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps Mode open when a feed connects and collapses the two data sections', () => {
    const { rerender } = render(<Controls />);
    const mode = screen.getByRole('button', { name: 'Mode' });
    const session = screen.getByRole('button', { name: 'Session Management' });
    const source = screen.getByRole('button', { name: 'Data Source' });
    fireEvent.click(session);
    marketDataState.isLoading = true;
    rerender(<Controls />);
    for (const toggle of [mode, session, source]) expect(toggle).toHaveAttribute('aria-expanded', 'true');

    marketDataState.isLoading = false;
    marketDataState.isConnected = true;
    marketDataState.sourceName = 'Binance';
    rerender(<Controls />);
    for (const toggle of [session, source]) expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(mode).toHaveAttribute('aria-expanded', 'true');
    expect(source).toHaveTextContent('Binance');
    expect(screen.getByRole('radio', { name: 'Playback' })).toBeChecked();

    fireEvent.click(source);
    expect(screen.getByRole('button', { name: 'Disconnect Binance' })).toBeVisible();
    fireEvent.click(mode);
    marketDataState.isConnected = false;
    rerender(<Controls />);
    marketDataState.isConnected = true;
    rerender(<Controls />);
    expect(mode).toHaveAttribute('aria-expanded', 'false');
    expect(session).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(mode);
    expect(screen.getByRole('radio', { name: 'Playback' })).toBeChecked();
  });

  it('starts with Mode open when the sidebar mounts with a connected source', () => {
    marketDataState.isConnected = true;
    render(<Controls />);
    expect(screen.getByRole('button', { name: 'Mode' })).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['Session Management', /^Data Source/]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
    }
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

    fireEvent.click(screen.getByRole('button', { name: 'Connect with Rithmic credentials' }));
    marketDataState.sourceId = 'rithmic';
    marketDataState.isLoading = true;
    rerender(<Controls />);

    expect(screen.getByRole('status')).toHaveTextContent('Signing in and loading symbol data');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(marketDataState.disconnectSource).toHaveBeenCalledOnce();
  });
});
