import { useRef, useEffect, useState } from 'react';
import { Upload, Loader, StepForward, PlayCircle, TrendingUp, ChevronDown, Download, UploadCloud } from 'lucide-react';
import { useBacktestStore } from '../store/useBacktestStore';
import type { Candle } from '../types';
import { PlaybackBar } from './PlaybackBar';
import { TradingPanel } from './TradingPanel';
import { useTradeStore } from '../store/useTradeStore';


const PRESETS = [
  { name: 'BTC/USDT 1m (2025-2026)', filename: 'btc_usdt_m1_jan2025-apr2026.csv' },
  { name: 'ETH/USDT 1m (2025-2026)', filename: 'eth_usdt_m1_jan2025-apr2026.csv' },
  { name: 'Nasdaq 1m (09-2025)', filename: 'nasdaq-09-2025.csv' },
  { name: 'Nasdaq 1m (2022-2025)', filename: 'nasdaq_m1_2022-2025.csv' },
  { name: 'XAUUSDT Perp 1m (01-2026 - 05-2026)', filename: 'xauusdt_m1_jan2026-may2026.csv' },
];

export function Controls() {
  const {
    rawData, currentIndex, isPlaying, playbackSpeed, isUploading, uploadProgress, mode,
    loadData, setPlaybackSpeed, setUploading, setUploadProgress, setMode
  } = useBacktestStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionInputRef = useRef<HTMLInputElement>(null);
  const [isPresetsExpanded, setIsPresetsExpanded] = useState(true);
  const [isSessionExpanded, setIsSessionExpanded] = useState(false);

  // Auto-play logic
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      // Check if we reached the end
      if (useBacktestStore.getState().currentIndex >= useBacktestStore.getState().rawData.length - 1) {
        useBacktestStore.getState().togglePlayback();
      } else {
        useBacktestStore.getState().stepForward();
      }
    }, playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsPresetsExpanded(false);
    setUploading(true);
    setUploadProgress(0);

    const fileText = await file.text();
    const lines = fileText.split('\n').filter(line => line.trim().length > 0);
    const headerLine = lines[0];
    const headerValues = headerLine.split(',').map(h => h.trim());
    const dataLines = lines.slice(1);
    const parsedData: Candle[] = [];
    const chunkSize = Math.max(100, Math.floor(dataLines.length / 100));

    let extractedSymbol = '';
    if (headerValues.includes('symbol') && dataLines.length > 0) {
      const symbolIndex = headerValues.indexOf('symbol');
      extractedSymbol = dataLines[0].split(',')[symbolIndex]?.trim() || '';
    }

    const parseLine = (line: string): Candle | null => {
      const values = line.split(',');
      const headerValues = headerLine.split(',');
      const row: Record<string, string> = {};
      headerValues.forEach((h, i) => {
        row[h.trim()] = values[i]?.trim();
      });

      const dtStr = row.datetime;
      if (!dtStr) return null;

      const isoString = dtStr.replace(' ', 'T') + 'Z';
      const time = Math.floor(new Date(isoString).getTime() / 1000);
      if (isNaN(time)) return null;

      return {
        time,
        open: parseFloat(row.open),
        high: parseFloat(row.high),
        low: parseFloat(row.low),
        close: parseFloat(row.close),
        volume: parseFloat(row.volume),
      };
    };

    for (let i = 0; i < dataLines.length; i += chunkSize) {
      const chunk = dataLines.slice(i, i + chunkSize);
      for (const line of chunk) {
        const candle = parseLine(line);
        if (candle) parsedData.push(candle);
      }

      const progress = Math.round(((i + chunk.length) / dataLines.length) * 100);
      setUploadProgress(progress);

      await new Promise(resolve => setTimeout(resolve, 0));
    }

    parsedData.sort((a, b) => a.time - b.time);

    if (parsedData.length > 0) {
      setUploadProgress(100);
      loadData(parsedData, extractedSymbol || undefined);
      useTradeStore.getState().reset();
    } else {
      setUploading(false);
      setUploadProgress(0);
      alert("Failed to parse CSV data. Make sure headers are: datetime,open,high,low,close,volume");
    }
  };

  const loadPresetData = async (filename: string) => {
    try {
      setUploading(true);
      const response = await fetch(`${import.meta.env.BASE_URL}data/${filename}`);
      const csvText = await response.text();
      const file = new File([csvText], filename, { type: "text/csv" });

      handleFileUpload({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>);
    } catch (e) {
      setUploading(false);
      console.error(`Failed to load preset: ${filename}`, e);
    }
  };

  const handleExportSession = () => {
    const backtestState = useBacktestStore.getState();
    const tradeState = useTradeStore.getState();

    const session = {
      backtest: {
        symbol: backtestState.symbol,
        currentIndex: backtestState.currentIndex,
        charts: backtestState.charts,
        playbackSpeed: backtestState.playbackSpeed,
        mode: backtestState.mode
      },
      trade: {
        balance: tradeState.balance,
        realizedPnL: tradeState.realizedPnL,
        unrealizedPnL: tradeState.unrealizedPnL,
        position: tradeState.position,
        entryPrice: tradeState.entryPrice,
        activePositionSize: tradeState.activePositionSize,
        orderSize: tradeState.orderSize,
        takeProfit: tradeState.takeProfit,
        stopLoss: tradeState.stopLoss,
        leverage: tradeState.leverage,
        initialBalance: tradeState.initialBalance,
        marginBlowoutPercent: tradeState.marginBlowoutPercent,
        contractSize: tradeState.contractSize,
        feePercent: tradeState.feePercent,
        isBlown: tradeState.isBlown,
        hasTraded: tradeState.hasTraded,
        tradeHistory: tradeState.tradeHistory,
        isFinished: tradeState.isFinished,
        finishedPositions: tradeState.finishedPositions,
        currentPositionTrades: tradeState.currentPositionTrades
      }
    };

    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openbacktest_session_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSession = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const session = JSON.parse(event.target?.result as string);
        if (session.backtest && session.trade) {
          if (useBacktestStore.getState().rawData.length === 0) {
            alert('Please load the CSV data first before importing the session.');
            return;
          }
          useBacktestStore.getState().importState(session.backtest);
          useTradeStore.getState().importState(session.trade);
        } else {
          alert('Invalid session file format.');
        }
      } catch (err) {
        alert('Failed to parse session file.');
      }
      
      if (sessionInputRef.current) {
        sessionInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const currentCandle = rawData[currentIndex];
  const currentDate = currentCandle
    ? new Date(currentCandle.time * 1000).toISOString().replace('T', ' ').substring(0, 19)
    : 'No Data';

  return (
    <div className="flex flex-col h-full bg-dark-800 border-r border-dark-700 w-80 p-6 shadow-xl z-10 text-sm">
      <div className="mb-8">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-500 to-emerald-400 mb-2">OpenBackTest</h1>
        <div className="flex items-center justify-between">
          <p className="text-slate-400 text-xs">Manual Strategy Tester</p>
          <a
            href="https://github.com/BinaryMasc/OpenBackTest"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-400 hover:text-emerald-400 bg-dark-900/50 hover:bg-dark-900 border border-dark-700/50 hover:border-emerald-500/30 transition-all duration-200 hover:shadow-[0_0_8px_rgba(16,185,129,0.15)]"
          >
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="currentColor"
              className="transition-transform duration-200 group-hover:scale-110"
            >
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            <span>GitHub</span>
          </a>
        </div>
      </div>

      {/* Scrollable Middle Section */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4 -mr-2">
        {/* Mode Selector */}
        <div className="mb-6 space-y-2">
          <h3 className="text-slate-400 uppercase text-xs font-bold tracking-wider mb-3">Mode</h3>
          <div className="flex bg-dark-900 p-1 rounded-xl border border-dark-700">
            <button
              onClick={() => setMode('playback')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'playback'
                ? 'bg-primary-500 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <PlayCircle size={14} />
              Playback
            </button>
            <button
              onClick={() => setMode('simulation')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'simulation'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <TrendingUp size={14} />
              Simulation
            </button>
          </div>
        </div>

        {/* Session Management */}
        <div className="mb-6 space-y-2">
          <button
            onClick={() => setIsSessionExpanded(!isSessionExpanded)}
            className="w-full flex items-center justify-between text-xs text-slate-500 uppercase font-bold tracking-widest mb-3 hover:text-slate-300 transition-colors group"
          >
            Session Management
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${isSessionExpanded ? '' : '-rotate-90'}`}
            />
          </button>
          
          {isSessionExpanded && (
            <div className="flex gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <button
                onClick={handleExportSession}
                disabled={rawData.length === 0}
                className="flex-1 flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-white py-2 rounded-lg transition-colors border border-slate-600/50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
              >
                <Download size={14} />
                Export
              </button>
              <input
                type="file"
                accept=".json"
                className="hidden"
                ref={sessionInputRef}
                onChange={handleImportSession}
              />
              <button
                onClick={() => sessionInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-white py-2 rounded-lg transition-colors border border-slate-600/50 text-xs font-medium"
              >
                <UploadCloud size={14} />
                Import
              </button>
            </div>
          )}
        </div>

        {/* Data Source */}
        {
          !(mode === 'simulation' && rawData.length > 0) && (
            <div className="mb-6 space-y-2">
              <h3 className="text-slate-400 uppercase text-xs font-bold tracking-wider mb-3">Data Source</h3>
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
                className="w-full flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-white py-3 rounded-lg transition-colors border border-slate-600/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? <Loader size={18} className="animate-spin" /> : <Upload size={18} />}
                {isUploading ? 'Processing...' : 'Load CSV Data'}
              </button>
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
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.filename}
                        onClick={() => loadPresetData(preset.filename)}
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
                      className="h-full bg-gradient-to-r from-primary-500 to-emerald-400 rounded-full transition-all duration-200 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="text-xs text-slate-500 mt-2">
                {!isUploading && (rawData.length > 0 ? `${rawData.length} candles loaded` : 'No data loaded')}
              </div>
            </div>
          )
        }

        {/* Controls */}
        <div className="mb-6 space-y-4">
          <h3 className="text-slate-400 uppercase text-xs font-bold tracking-wider mb-3">Settings</h3>
          {/* 
        <div>
          <label className="block text-slate-300 text-xs mb-1">Timeframe</label>
          <div className="grid grid-cols-3 gap-2">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`py-1.5 rounded-md border ${timeframe === tf ? 'bg-primary-500/20 border-primary-500 text-primary-500' : 'bg-dark-700 border-transparent text-slate-300 hover:bg-dark-600'}`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div> */}

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

          {/* Playback Bar (Conditional) */}
          {mode === 'playback' && (
            <div className="pt-4 border-t border-dark-700/50">
              <h4 className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-3">Playback Controls</h4>
              <PlaybackBar />
            </div>
          )}

          {/* Simulation Controls (Conditional) */}
          {mode === 'simulation' && (
            <TradingPanel />
          )}
        </div>
      </div>

      {/* Playback */}
      <div className="mt-auto space-y-4">
        <div className="bg-dark-900 p-3 rounded-lg border border-dark-700">
          <div className="text-slate-400 text-xs mb-1">Current Tick Time</div>
          <div className="font-mono text-emerald-400">{currentDate}</div>
        </div>

      </div>
    </div>
  );
}
