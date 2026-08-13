import { Settings, History, Check, ChevronDown, Play, Pause, ChevronRight, ChevronsRight, LayoutGrid } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useBacktestStore } from '../../store/useBacktestStore';
import { useMarketDataStore } from '../../store/useMarketDataStore';
import { useTradeStore } from '../../store/useTradeStore';
import { TIMEFRAMES } from '../../types';

/**
 * Top-left legend showing the current symbol and a config dropdown.
 */
interface SymbolLegendProps {
  chartId: string;
}

export function SymbolLegend({ chartId }: SymbolLegendProps) {
  const symbol = useBacktestStore(state => state.symbol) || 'NO SYMBOL';
  const charts = useBacktestStore(state => state.charts);
  const setChartTimeframe = useBacktestStore(state => state.setChartTimeframe);
  const addChart = useBacktestStore(state => state.addChart);
  const removeChart = useBacktestStore(state => state.removeChart);
  const timeframe = charts.find(c => c.id === chartId)?.timeframe || '1m';
  const isPlaying = useBacktestStore(state => state.isPlaying);
  const togglePlayback = useBacktestStore(state => state.togglePlayback);
  const stepForward = useBacktestStore(state => state.stepForward);
  const fastForward = useBacktestStore(state => state.fastForward);
  const rawData = useBacktestStore(state => state.rawData);
  //const mode = useBacktestStore(state => state.mode);

  const isConnected = useMarketDataStore(state => state.isConnected);
  const sourceName = useMarketDataStore(state => state.sourceName);
  const symbols = useMarketDataStore(state => state.symbols);
  const setSymbol = useMarketDataStore(state => state.setSymbol);

  const showTradeHistory = useTradeStore(state => state.showTradeHistory);
  const setShowTradeHistory = useTradeStore(state => state.setShowTradeHistory);

  const [isOpen, setIsOpen] = useState(false);
  const [isTfOpen, setIsTfOpen] = useState(false);
  const [isLayoutOpen, setIsLayoutOpen] = useState(false);
  const [isSymbolDropdownOpen, setIsSymbolDropdownOpen] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const tfRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const symbolDropdownRef = useRef<HTMLDivElement>(null);

  const handleLayoutChange = (num: number) => {
    const currentLen = charts.length;
    if (num > currentLen) {
      for (let i = currentLen; i < num; i++) {
        addChart({ id: `chart-${Date.now()}-${i}`, timeframe: '1m' });
      }
    } else if (num < currentLen) {
      for (let i = currentLen - 1; i >= num; i--) {
        removeChart(charts[i].id);
      }
    }
    setIsLayoutOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
      if (tfRef.current && !tfRef.current.contains(event.target as Node)) {
        setIsTfOpen(false);
      }
      if (layoutRef.current && !layoutRef.current.contains(event.target as Node)) {
        setIsLayoutOpen(false);
      }
      if (symbolDropdownRef.current && !symbolDropdownRef.current.contains(event.target as Node)) {
        setIsSymbolDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-2 pointer-events-auto relative" ref={dropdownRef}>
      <div className="flex items-center gap-2 px-2 py-1">
        {isConnected ? (
          <div className="relative" ref={symbolDropdownRef}>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSymbolDropdownOpen(!isSymbolDropdownOpen)}
                className="text-sm font-bold text-slate-100 tracking-tight mr-1 flex items-center gap-1 hover:text-emerald-400 transition-colors"
              >
                {symbol || 'Select Symbol'}
                <ChevronDown size={12} className={`transition-transform duration-200 ${isSymbolDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                {sourceName || 'Market'} Live
              </span>
            </div>

            {isSymbolDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-dark-800 border border-dark-700 rounded-lg shadow-2xl py-1 z-[100] animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-2 pb-1 mb-1 border-b border-dark-700/50">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={symbolSearch}
                    onChange={(e) => setSymbolSearch(e.target.value)}
                    className="w-full bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="max-h-48 overflow-y-auto custom-scrollbar">
                  {symbols
                    .filter(item => item.symbol.toLowerCase().includes(symbolSearch.toLowerCase()))
                    .map(item => (
                      <button
                        key={item.symbol}
                        onClick={() => {
                          setSymbol(item.symbol);
                          setIsSymbolDropdownOpen(false);
                          setSymbolSearch('');
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-dark-700 ${symbol === item.symbol ? 'text-emerald-500 bg-emerald-500/10' : 'text-slate-300'}`}
                      >
                        {item.symbol}
                      </button>
                    ))}
                  {symbols.filter(item => item.symbol.toLowerCase().includes(symbolSearch.toLowerCase())).length === 0 && (
                    <div className="px-3 py-2 text-xs text-slate-500 text-center">No symbols found</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-100 tracking-tight mr-1">
              {symbol}
            </span>
            {rawData.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                Playback
              </span>
            )}
          </div>
        )}

        <div className="w-px h-3 bg-dark-700/50 mx-1" />


        <div className="relative bg-dark-700/50" ref={tfRef}>
          <button
            onClick={() => setIsTfOpen(!isTfOpen)}
            className={`text-[13px] font-bold px-2.5 py-0.5 rounded border transition-all flex items-center gap-1.5 uppercase   ${isTfOpen ? 'text-primary-400 border-primary-500/30' : 'bg-dark-900/50 text-slate-400 border-dark-700/30 hover:text-slate-200 hover:border-dark-600'}`}
          >
            {timeframe}
            <ChevronDown size={10} className={`transition-transform duration-200 ${isTfOpen ? 'rotate-180' : ''}`} />
          </button>

          {isTfOpen && (
            <div className="absolute top-full left-0 mt-2 bg-dark-800 border border-dark-700 rounded-lg shadow-2xl py-1 z-[100] min-w-[70px] animate-in fade-in slide-in-from-top-1 duration-150">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf}
                  onClick={() => {
                    setChartTimeframe(chartId, tf);
                    setIsTfOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-[11px] font-medium transition-colors hover:bg-dark-700 ${timeframe === tf ? 'text-primary-500 bg-primary-500/10' : 'text-slate-400'}`}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-3 bg-dark-700/50 mx-1" />

        {!isConnected && (
          <>
            <div className="flex items-center gap-1">
              <button
                onClick={togglePlayback}
                disabled={rawData.length === 0}
                className={`p-2 rounded-md transition-all ${isPlaying
                  ? 'text-danger hover:bg-danger/10'
                  : 'text-blue-500 hover:bg-emerald-500/10'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              </button>

              <button
                onClick={stepForward}
                disabled={rawData.length === 0 || isPlaying}
                className="p-2 rounded-md text-slate-400 hover:text-slate-100 hover:bg-dark-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                title="Step Forward"
              >
                <ChevronRight size={18} />
              </button>

              <button
                onClick={fastForward}
                disabled={rawData.length === 0 || isPlaying}
                className="p-2 rounded-md text-slate-400 hover:text-slate-100 hover:bg-dark-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                title="Fast Forward (+10)"
              >
                <ChevronsRight size={18} />

              </button>
              <div className="w-px h-3 bg-dark-700/50 mx-1" />
            </div>
          </>
        )}


        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center justify-center p-1.5 rounded-md transition-all gap-1.5 ${isOpen ? 'text-primary-400 bg-primary-500/10' : 'text-slate-500 hover:text-slate-300 hover:bg-dark-700'}`}
          title="Chart Settings"
        >
          <Settings size={16} className={`${isOpen ? 'animate-spin-slow' : ''}`} />
          <ChevronDown size={10} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-56 bg-dark-800 border border-dark-700 rounded-lg shadow-2xl py-1 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-dark-700/50 mb-1">
            Chart Configuration
          </div>

          <button
            onClick={() => {
              setShowTradeHistory(!showTradeHistory);
              setIsOpen(false);
            }}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-300 hover:bg-primary-500/10 hover:text-primary-400 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <History size={14} className="text-slate-500 group-hover:text-primary-500 transition-colors" />
              <span>Show History Trades</span>
            </div>
            {showTradeHistory && <Check size={14} className="text-primary-500" />}
          </button>
        </div>
      )}

      {/* Layout Menu */}
      <div className="relative" ref={layoutRef}>
        <button
          onClick={() => setIsLayoutOpen(!isLayoutOpen)}
          className={`flex items-center justify-center p-1.5 rounded-md transition-all gap-1.5 ${isLayoutOpen ? 'text-primary-400 bg-primary-500/10' : 'text-slate-500 hover:text-slate-300 hover:bg-dark-700'}`}
          title="Chart Layout"
        >
          <LayoutGrid size={16} />
          <ChevronDown size={10} className={`transition-transform duration-200 ${isLayoutOpen ? 'rotate-180' : ''}`} />
        </button>

        {isLayoutOpen && (
          <div className="absolute top-full left-0 mt-2 bg-dark-800 border border-dark-700 rounded-lg shadow-2xl py-1 z-[100] min-w-[100px] animate-in fade-in slide-in-from-top-2 duration-150">
            {[1, 2, 3].map(num => (
              <button
                key={num}
                onClick={() => handleLayoutChange(num)}
                className={`w-full px-3 py-1.5 text-left text-[11px] font-medium transition-colors hover:bg-dark-700 ${charts.length === num ? 'text-primary-500 bg-primary-500/10' : 'text-slate-400'}`}
              >
                {num} Chart{num > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
