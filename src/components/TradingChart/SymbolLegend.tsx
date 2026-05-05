import { Settings, History, Check, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useBacktestStore } from '../../store/useBacktestStore';
import { useTradeStore } from '../../store/useTradeStore';
import { TIMEFRAMES } from '../../types';

/**
 * Top-left legend showing the current symbol and a config dropdown.
 */
export function SymbolLegend() {
  const symbol = useBacktestStore(state => state.symbol) || 'NO SYMBOL';
  const timeframe = useBacktestStore(state => state.timeframe);
  const setTimeframe = useBacktestStore(state => state.setTimeframe);
  const showTradeHistory = useTradeStore(state => state.showTradeHistory);
  const setShowTradeHistory = useTradeStore(state => state.setShowTradeHistory);

  const [isOpen, setIsOpen] = useState(false);
  const [isTfOpen, setIsTfOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
      if (tfRef.current && !tfRef.current.contains(event.target as Node)) {
        setIsTfOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-2 pointer-events-auto relative" ref={dropdownRef}>
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="text-sm font-bold text-slate-100 tracking-tight mr-1">
          {symbol}
        </span>

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
                    setTimeframe(tf);
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
        <div className="absolute top-full left-0 mt-2 w-56 bg-dark-800 border border-dark-700 rounded-lg shadow-2xl py-1 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
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

          {/* Add more config options here if needed in future */}
        </div>
      )}
    </div>
  );
}
