import { useRef, useEffect } from 'react';
import { Play, Pause, StepForward, Upload, Loader } from 'lucide-react';
import { useBacktestStore } from '../store/useBacktestStore';
import type { Candle, Timeframe } from '../types';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export function Controls() {
  const { 
    rawData, currentIndex, timeframe, isPlaying, playbackSpeed, isUploading, uploadProgress,
    loadData, setTimeframe, togglePlayback, stepForward, setPlaybackSpeed, setUploading, setUploadProgress 
  } = useBacktestStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    } else {
      setUploading(false);
      setUploadProgress(0);
      alert("Failed to parse CSV data. Make sure headers are: datetime,open,high,low,close,volume");
    }
  };

  const loadDemoData = async () => {
    try {
      setUploading(true);
      const response = await fetch('/data/btc_usdt_m1.csv');
      const csvText = await response.text();
      const file = new File([csvText], "btc_usdt_m1.csv", { type: "text/csv" });
      
      handleFileUpload({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>);
    } catch (e) {
      setUploading(false);
      console.error("Failed to load demo data", e);
    }
  };

  const currentCandle = rawData[currentIndex];
  const currentDate = currentCandle 
    ? new Date(currentCandle.time * 1000).toISOString().replace('T', ' ').substring(0, 19) 
    : 'No Data';

  return (
    <div className="flex flex-col h-full bg-dark-800 border-r border-dark-700 w-80 p-6 shadow-xl z-10 text-sm">
      <div className="mb-8">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-500 to-emerald-400 mb-2">OpenBackTest</h1>
        <p className="text-slate-400 text-xs">Manual Strategy Tester</p>
      </div>

      {/* Data Source */}
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
        <button 
          onClick={loadDemoData}
          disabled={isUploading}
          className="w-full flex items-center justify-center gap-2 bg-dark-800 hover:bg-dark-700 text-primary-400 py-2 rounded-lg transition-colors border border-primary-500/30 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? <Loader size={14} className="animate-spin" /> : null}
          {isUploading ? 'Processing...' : 'Load Demo Data'}
        </button>
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

      {/* Controls */}
      <div className="mb-6 space-y-4">
        <h3 className="text-slate-400 uppercase text-xs font-bold tracking-wider mb-3">Settings</h3>
        
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
        </div>

        <div>
          <label className="block text-slate-300 text-xs mb-1">Playback Speed (ms)</label>
          <input 
            type="range" 
            min="50" max="2000" step="50"
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(parseInt(e.target.value))}
            className="w-full accent-primary-500"
          />
          <div className="text-right text-xs text-slate-400">{playbackSpeed}ms</div>
        </div>
      </div>

      {/* Playback */}
      <div className="mt-auto space-y-4">
        <div className="bg-dark-900 p-3 rounded-lg border border-dark-700">
          <div className="text-slate-400 text-xs mb-1">Current Tick Time</div>
          <div className="font-mono text-emerald-400">{currentDate}</div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={togglePlayback}
            disabled={rawData.length === 0}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all ${isPlaying ? 'bg-danger/20 text-danger border border-danger/50' : 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/50 hover:bg-emerald-500/30'}`}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          
          <button 
            onClick={stepForward}
            disabled={rawData.length === 0 || isPlaying}
            className="flex-1 flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-white py-3 rounded-lg transition-colors border border-slate-600/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <StepForward size={18} />
            Step
          </button>
        </div>
      </div>
    </div>
  );
}
