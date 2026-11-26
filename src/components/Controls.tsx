import { useEffect, useRef, useState } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useBacktestStore } from '../store/useBacktestStore';
import { useMarketDataStore } from '../store/useMarketDataStore';
import { PlaybackBar } from './PlaybackBar';
import { TradingPanel } from './TradingPanel';
import { ActualAccountPanel } from './ActualAccountPanel';
import { RithmicConnectionDialog } from './RithmicConnectionDialog';
import { SidebarHeader } from './controls/SidebarHeader';
import { ModeSelector } from './controls/ModeSelector';
import { SessionSection } from './controls/SessionSection';
import { DataSourceSection } from './controls/DataSourceSection';
import { CurrentTickTime } from './controls/CurrentTickTime';
import { useRithmicConnection } from './controls/useRithmicConnection';

/** Left sidebar: data source, mode, playback/trading controls. A drawer on mobile. */
export function Controls() {
  const mode = useBacktestStore(state => state.mode);
  const playbackSpeed = useBacktestStore(state => state.playbackSpeed);
  const setPlaybackSpeed = useBacktestStore(state => state.setPlaybackSpeed);
  const isConnected = useMarketDataStore(state => state.isConnected);
  const marketDataError = useMarketDataStore(state => state.error);
  const rithmic = useRithmicConnection();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopExpanded, setIsDesktopExpanded] = useState(true);
  const mobileToggle = useRef<HTMLButtonElement>(null);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
        mobileToggle.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  const openRithmicDialog = () => {
    rithmic.openDialog();
    closeMobileMenu();
  };

  const isLiveMode = mode === 'live';

  const desktopToggleLabel = isDesktopExpanded ? 'Collapse trading controls' : 'Expand trading controls';
  const toggleStyle = 'items-center justify-center rounded-md text-slate-300 hover:bg-dark-700 hover:text-white focus-visible:outline-2 focus-visible:outline-primary-500';

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        ref={mobileToggle}
        onClick={() => setIsMobileMenuOpen(open => !open)}
        className={`fixed left-2 flex size-10 md:hidden ${toggleStyle} ${isMobileMenuOpen ? 'top-4 z-[120]' : 'top-1 z-[70]'}`}
        aria-controls="trading-controls-sidebar"
        aria-expanded={isMobileMenuOpen}
        aria-label={isMobileMenuOpen ? 'Close trading controls menu' : 'Open trading controls menu'}
      >
        {isMobileMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>

      <button
        type="button"
        onClick={() => setIsDesktopExpanded(expanded => !expanded)}
        className={`absolute left-full top-1 z-[70] ml-2 hidden size-10 md:flex ${toggleStyle}`}
        aria-controls="trading-controls-sidebar"
        aria-expanded={isDesktopExpanded}
        aria-label={desktopToggleLabel}
        title={desktopToggleLabel}
      >
        {isDesktopExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
      </button>

      <button
        type="button"
        onClick={closeMobileMenu}
        className={`fixed inset-0 z-[110] bg-black/60 transition-opacity duration-200 md:hidden ${isMobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-label="Close menu by clicking outside"
        aria-hidden={!isMobileMenuOpen}
        tabIndex={isMobileMenuOpen ? 0 : -1}
      />

      <aside
        id="trading-controls-sidebar"
        aria-label="Trading controls"
        className={`fixed inset-y-0 left-0 z-[115] flex h-full w-80 max-w-[calc(100vw-3.5rem)] flex-col overflow-y-auto border-r border-dark-700 bg-dark-800 p-4 md:p-6 text-sm shadow-xl transition-transform duration-200 ease-out ${isMobileMenuOpen ? 'visible translate-x-0' : 'invisible pointer-events-none -translate-x-full'} ${isDesktopExpanded ? 'md:flex' : 'md:hidden'} md:static md:z-10 md:w-80 md:max-w-none md:translate-x-0 md:visible md:pointer-events-auto md:overflow-hidden md:shadow-xl`}
      >
        <SidebarHeader />

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4 -mr-2">
          <ModeSelector />
          <SessionSection />
          <DataSourceSection onOpenRithmicDialog={openRithmicDialog} />

          <div className="mb-6 space-y-4">
            <h3 className="text-slate-400 uppercase text-xs font-bold tracking-wider mb-3">Settings</h3>

            {!isLiveMode && !isConnected && (
              <div>
                <label className="block text-slate-300 text-xs mb-1">Playback Speed (ms)</label>
                <input
                  type="range"
                  min="10" max="2000" step="10"
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(parseInt(e.target.value))}
                  className="w-full accent-primary-500"
                />
                <div className="text-right text-xs text-slate-400">{playbackSpeed}ms</div>
              </div>
            )}

            {mode === 'playback' && !isConnected && (
              <div className="pt-4 border-t border-dark-700/50">
                <h4 className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-3">Playback Controls</h4>
                <PlaybackBar />
              </div>
            )}

            {mode === 'simulation' && <TradingPanel />}
            {isLiveMode && <ActualAccountPanel />}
          </div>
        </div>

        <div className="mt-auto space-y-4">
          <CurrentTickTime />
        </div>
      </aside>

      <RithmicConnectionDialog
        isOpen={rithmic.isDialogOpen}
        isLoading={rithmic.isConnecting}
        credentials={rithmic.credentials}
        error={marketDataError}
        rememberCredentials={rithmic.rememberCredentials}
        onCredentialsChange={rithmic.updateCredential}
        onRememberCredentialsChange={rithmic.changeRememberCredentials}
        onConnect={rithmic.connect}
        onClose={rithmic.closeDialog}
      />
    </div>
  );
}
