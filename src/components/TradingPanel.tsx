import { useEffect, useState } from 'react';
import { useTradeStore } from '../store/useTradeStore';
import { useBacktestStore } from '../store/useBacktestStore';
import { CircleOff, Wallet, BarChart3, Activity, ChevronDown } from 'lucide-react';

export function TradingPanel() {
  const {
    balance, realizedPnL, unrealizedPnL, position, entryPrice, activePositionSize, orderSize,
    buy, sell, flat, updateUnrealizedPnL, setOrderSize
  } = useTradeStore();

  const { rawData, currentIndex } = useBacktestStore();
  const currentCandle = rawData[currentIndex];
  const currentPrice = currentCandle?.close || 0;

  const [isExpanded, setIsExpanded] = useState(true);

  // Update Unrealized P&L whenever price or position changes
  useEffect(() => {
    if (currentPrice) {
      updateUnrealizedPnL(currentPrice);
    }
  }, [currentIndex, currentPrice, position, entryPrice, activePositionSize, updateUnrealizedPnL]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const pnlColor = position === 'flat' ? 'text-slate-500' : (unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400');
  const realizedColor = realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="pt-4 border-t border-dark-700/50 space-y-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1 hover:text-slate-300 transition-colors group"
      >
        Trading Dashboard
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
        />
      </button>

      {isExpanded && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-dark-900/50 p-2.5 rounded-lg border border-dark-700/50">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase font-bold mb-1">
                <Wallet size={12} />
                Balance
              </div>
              <div className="text-sm font-mono font-bold text-slate-200">
                {formatCurrency(balance)}
              </div>
            </div>

            <div className="bg-dark-900/50 p-2.5 rounded-lg border border-dark-700/50">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase font-bold mb-1">
                <BarChart3 size={12} />
                Realized P&L
              </div>
              <div className={`text-sm font-mono font-bold ${realizedColor}`}>
                {realizedPnL >= 0 ? '+' : ''}{formatCurrency(realizedPnL)}
              </div>
            </div>

            <div className="bg-dark-900/50 p-2.5 rounded-lg border border-dark-700/50 col-span-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase font-bold">
                  <Activity size={12} />
                  Unrealized P&L
                </div>
              </div>
              <div className={`text-xl font-mono font-bold ${pnlColor}`}>
                {position !== 'flat' && unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(unrealizedPnL)}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Position Size */}
      <div>
        <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1.5 tracking-wider">Position Size</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={orderSize}
            onChange={(e) => setOrderSize(Math.max(0.01, parseFloat(e.target.value) || 0))}
            className="flex-1 bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500 transition-colors"
            step="0.1"
            min="0.01"
          />
        </div>
      </div>

      {/* Trading Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => buy(currentPrice)}
          disabled={!currentPrice}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-bold transition-all shadow-lg shadow-emerald-900/20 active:scale-95 disabled:opacity-50"
        >
          Buy (Long)
        </button>
        <button
          onClick={() => sell(currentPrice)}
          disabled={!currentPrice}
          className="flex items-center justify-center gap-2 bg-[#ef5350] hover:bg-[#d32f2f] text-white py-3 rounded-lg font-bold transition-all shadow-lg shadow-red-900/10 active:scale-95 disabled:opacity-50"
        >
          Sell (Short)
        </button>
        <button
          onClick={() => flat(currentPrice)}
          disabled={position === 'flat' || !currentPrice}
          className="col-span-2 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg font-bold transition-all active:scale-95 disabled:opacity-50"
        >
          <CircleOff size={16} />
          Flat Position
        </button>
      </div>

      {/* Position Details Bellow */}
      <div className="pt-3 border-t border-dark-700/30 space-y-1.5">
        <div className="flex justify-between items-center text-[10px] uppercase font-bold">
          <span className="text-slate-500">Current Position</span>
          <span className={position === 'flat' ? 'text-slate-400' : (position === 'long' ? 'text-emerald-500' : 'text-red-500')}>
            {position}
          </span>
        </div>
        <div className="flex justify-between items-center text-[10px] uppercase font-bold">
          <span className="text-slate-500">Avg Price</span>
          <span className="text-slate-300 font-mono">{entryPrice ? entryPrice.toFixed(2) : '-'}</span>
        </div>
        <div className="flex justify-between items-center text-[10px] uppercase font-bold">
          <span className="text-slate-500">Total Contracts</span>
          <span className="text-slate-300 font-mono">{activePositionSize.toFixed(4)}</span>
        </div>
        <div className="flex justify-between items-center text-[10px] uppercase font-bold">
          <span className="text-slate-500">Unrealized P&L</span>
          <span className="text-slate-300 font-mono">{unrealizedPnL.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
