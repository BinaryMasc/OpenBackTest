import { useRef, useState } from 'react';
import { Activity, ChevronDown, Loader, StepForward, Upload, Zap } from 'lucide-react';
import { useBacktestStore } from '../../store/useBacktestStore';
import { useMarketDataStore } from '../../store/useMarketDataStore';
import { useTradeStore } from '../../store/useTradeStore';
import { RITHMIC_SOURCE_ID } from '../../services/rithmic';
import { BinanceService } from '../../services/binance';
import { parseCandleCsv } from '../../utils/csv';
import { SidebarSection } from './SidebarSection';

const PRESETS = [
  { name: 'BTC/USDT 1m (2025-2026)', filename: 'btc_usdt_m1_jan2025-apr2026.csv' },
  { name: 'ETH/USDT 1m (2025-2026)', filename: 'eth_usdt_m1_jan2025-apr2026.csv' },
  { name: 'Nasdaq 1m (09-2025)', filename: 'nasdaq-09-2025.csv' },
  { name: 'Nasdaq 1m (2022-2025)', filename: 'nasdaq_m1_2022-2025.csv' },
  { name: 'XAUUSDT Perp 1m (01-2026 - 05-2026)', filename: 'xauusdt_m1_jan2026-may2026.csv' },
];

const PRIMARY_BUTTON = 'w-full flex items-center justify-center gap-2 py-3 rounded-lg transition-colors border disabled:opacity-50 disabled:cursor-not-allowed';
const NEUTRAL_BUTTON = `${PRIMARY_BUTTON} bg-dark-700 hover:bg-dark-600 text-white border-slate-600/50`;
const CONNECTED_BUTTON = `${PRIMARY_BUTTON} bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20`;

interface DataSourceSectionProps {
  onOpenRithmicDialog: () => void;
}

export function DataSourceSection({ onOpenRithmicDialog }: DataSourceSectionProps) {
  const candleCount = useBacktestStore(state => state.rawData.length);
  const mode = useBacktestStore(state => state.mode);
  const isUploading = useBacktestStore(state => state.isUploading);
  const uploadProgress = useBacktestStore(state => state.uploadProgress);
  const loadData = useBacktestStore(state => state.loadData);
  const setUploading = useBacktestStore(state => state.setUploading);
  const setUploadProgress = useBacktestStore(state => state.setUploadProgress);

  const sourceId = useMarketDataStore(state => state.sourceId);
  const sourceName = useMarketDataStore(state => state.sourceName);
  const isConnected = useMarketDataStore(state => state.isConnected);
  const isMarketDataLoading = useMarketDataStore(state => state.isLoading);
  const marketDataError = useMarketDataStore(state => state.error);
  const connectDefaultSource = useMarketDataStore(state => state.connectDefaultSource);
  const disconnectSource = useMarketDataStore(state => state.disconnectSource);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPresetsExpanded, setIsPresetsExpanded] = useState(true);

  const isLiveMode = mode === 'live';
  const isRithmicConnected = sourceId === RITHMIC_SOURCE_ID && isConnected;
  const isBusy = isUploading || isMarketDataLoading;

  // Collapse the preset list once a live source connects.
  const [wasConnected, setWasConnected] = useState(isConnected);
  if (isConnected !== wasConnected) {
    setWasConnected(isConnected);
    if (isConnected) setIsPresetsExpanded(false);
  }

  const loadCsvText = async (text: string) => {
    setIsPresetsExpanded(false);
    setUploading(true);
    setUploadProgress(0);

    const { candles, symbol } = await parseCandleCsv(text, setUploadProgress);
    if (candles.length === 0) {
      setUploading(false);
      setUploadProgress(0);
      alert('Failed to parse CSV data. Make sure headers are: datetime,open,high,low,close,volume');
      return;
    }
    const marketData = useMarketDataStore.getState();
    if (marketData.sourceId === BinanceService.id) marketData.disconnectSource();
    setUploadProgress(100);
    loadData(candles, symbol || undefined);
    useTradeStore.getState().reset();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await loadCsvText(await file.text());
  };

  const loadPreset = async (filename: string) => {
    try {
      setUploading(true);
      const response = await fetch(`${import.meta.env.BASE_URL}data/${filename}`);
      await loadCsvText(await response.text());
    } catch (error) {
      setUploading(false);
      console.error(`Failed to load preset: ${filename}`, error);
    }
  };

  // In simulation the data set is locked once loaded.
  if (mode === 'simulation' && candleCount > 0) return null;

  return (
    <>
      <SidebarSection title={isLiveMode ? 'Broker Data Source' : 'Data Source'} summary={isConnected ? sourceName || 'Connected' : undefined} collapseOnConnect>
        {!isLiveMode && (
          <>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={NEUTRAL_BUTTON}
            >
              {isUploading ? <Loader size={18} className="animate-spin" /> : <Upload size={18} />}
              {isUploading ? 'Processing...' : 'Load CSV Data'}
            </button>
          </>
        )}

        {!isLiveMode && (
          <button
            onClick={isConnected ? disconnectSource : () => void connectDefaultSource()}
            disabled={isBusy}
            className={`mt-2 ${isConnected ? CONNECTED_BUTTON : NEUTRAL_BUTTON}`}
          >
            {isConnected ? (
              <>
                <Activity size={18} className="animate-pulse" />
                Disconnect {sourceName || 'Market Data'}
              </>
            ) : (
              <>
                <Zap size={18} />
                Connect Binance Market Data
              </>
            )}
          </button>
        )}

        {isLiveMode && isConnected && (
          <button onClick={disconnectSource} disabled={isBusy} className={`mt-2 ${CONNECTED_BUTTON}`}>
            <Activity size={18} className="animate-pulse" />
            Disconnect {sourceName || 'Broker Data'}
          </button>
        )}

        {!isRithmicConnected && (
          <button onClick={onOpenRithmicDialog} disabled={isBusy} className={`mt-2 ${NEUTRAL_BUTTON}`}>
            <Zap size={18} />
            Connect with Rithmic credentials
          </button>
        )}

        {!isLiveMode && (
          <>
            <div className="pt-4">
              <button
                onClick={() => setIsPresetsExpanded(!isPresetsExpanded)}
                className="w-full flex items-center justify-between text-xs text-slate-500 uppercase font-bold tracking-widest mb-3 hover:text-slate-300 transition-colors group"
              >
                Preset Data Sets
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${isPresetsExpanded ? '' : '-rotate-90'}`}
                />
              </button>
              {isPresetsExpanded && (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                  {PRESETS.map(preset => (
                    <button
                      key={preset.filename}
                      onClick={() => loadPreset(preset.filename)}
                      disabled={isUploading}
                      className="w-full flex items-center justify-between gap-2 hover:bg-dark-700/50 text-slate-400 hover:text-white py-2 px-3 rounded-lg transition-all text-left text-xs disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      <span className="truncate">{preset.name}</span>
                      {isUploading ? (
                        <Loader size={14} className="animate-spin text-primary-500" />
                      ) : (
                        <StepForward size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-primary-500" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isUploading && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Processing CSV...</span>
                  <span className="text-primary-400 font-mono">{uploadProgress}%</span>
                </div>
                <div className="h-1.5 bg-dark-900 rounded-full overflow-hidden border border-dark-700">
                  <div
                    className="h-full bg-primary-500 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
            <div className="text-xs text-slate-500 mt-2">
              {!isUploading && (candleCount > 0 ? `${candleCount} candles loaded` : 'No data loaded')}
            </div>
          </>
        )}
      </SidebarSection>
      {marketDataError && (
        <div className="mb-4 text-xs text-red-400" role="alert">
          {marketDataError}
        </div>
      )}
    </>
  );
}
