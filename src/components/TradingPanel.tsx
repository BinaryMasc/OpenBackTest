import { useEffect, useState } from 'react';
import { useTradeStore } from '../store/useTradeStore';
import { useBacktestStore } from '../store/useBacktestStore';
import { CircleOff, Wallet, BarChart3, Activity, ChevronDown } from 'lucide-react';

export function TradingPanel() {
  const {
    balance, realizedPnL, unrealizedPnL, position, entryPrice, activePositionSize, orderSize,
    takeProfit, stopLoss,
    leverage, initialBalance, /*marginBlowoutPercent, */ contractSize, feePercent, isBlown, hasTraded,
    buy, sell, flat, updateUnrealizedPnL, setOrderSize, setTakeProfit, setStopLoss,
    setLeverage, setInitialBalance, /*setMarginBlowoutPercent, */ setContractSize, setFeePercent,
    reset, finishSimulation, isFinished, setShowStatsModal
  } = useTradeStore();

  const { rawData, currentIndex } = useBacktestStore();
  const currentCandle = rawData[currentIndex];
  const currentPrice = currentCandle?.close || 0;

  const [isExpanded, setIsExpanded] = useState(true);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);

  const equity = balance + unrealizedPnL;
  const positionValue = activePositionSize * currentPrice * contractSize;

  // TODO: marginBlowoutPercent is unused for now
  // const marginRequired = positionValue * (marginBlowoutPercent / 100);

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
      {/* Account Configuration */}
      <div>
        <button
          onClick={() => setIsConfigExpanded(!isConfigExpanded)}
          className="w-full flex items-center justify-between text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1 hover:text-slate-300 transition-colors group"
        >
          Account Configuration
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${isConfigExpanded ? '' : '-rotate-90'}`}
          />
        </button>

        {isConfigExpanded && (
          <div className="grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-2 duration-200 mt-2">
            <div>
              <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">Leverage</label>
              <input
                type="number"
                value={leverage}
                onChange={(e) => setLeverage(Math.max(1, parseFloat(e.target.value) || 1))}
                readOnly={hasTraded}
                className="w-full bg-dark-900 border border-dark-700 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-primary-500 disabled:opacity-50 read-only:opacity-50"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">Initial Balance</label>
              <input
                type="number"
                value={initialBalance}
                onChange={(e) => setInitialBalance(Math.max(1, parseFloat(e.target.value) || 1))}
                readOnly={hasTraded}
                className="w-full bg-dark-900 border border-dark-700 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-primary-500 read-only:opacity-50"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">Contract Size</label>
              <input
                type="number"
                value={contractSize}
                onChange={(e) => setContractSize(Math.max(0.0001, parseFloat(e.target.value) || 1))}
                readOnly={hasTraded}
                step="0.1"
                className="w-full bg-dark-900 border border-dark-700 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-primary-500 read-only:opacity-50"
              />
            </div>
            {/*
            <div>
              <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">Margin Blowout %</label>
              <input
                type="number"
                value={marginBlowoutPercent}
                onChange={(e) => setMarginBlowoutPercent(Math.max(0.1, parseFloat(e.target.value) || 5))}
                readOnly={hasTraded}
                step="0.5"
                className="w-full bg-dark-900 border border-dark-700 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-primary-500 read-only:opacity-50"
              />
            </div>
            */}
            <div className="col-span-2">
              <label className="block text-slate-400 text-[9px] uppercase font-bold mb-1">Fee %</label>
              <input
                type="number"
                value={feePercent}
                onChange={(e) => setFeePercent(Math.max(0, parseFloat(e.target.value) || 0))}
                readOnly={hasTraded}
                step="0.01"
                className="w-full bg-dark-900 border border-dark-700 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-primary-500 read-only:opacity-50"
              />
            </div>
          </div>
        )}
      </div>

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
                Equity
              </div>
              <div className="text-sm font-mono font-bold text-slate-200">
                {formatCurrency(equity)}
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
        <div className="flex justify-between items-end mb-1.5">
          <label className="block text-slate-400 text-[10px] uppercase font-bold tracking-wider">Position Size</label>
          <span className="text-[10px] text-slate-500 font-mono">
            Value: {formatCurrency(orderSize * currentPrice * contractSize)}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={orderSize}
            onChange={(e) => setOrderSize(Math.max(0.01, parseFloat(e.target.value) || 0))}
            className="flex-1 bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500 transition-colors disabled:opacity-50"
            step="0.1"
            min="0.01"
            disabled={isBlown}
          />
        </div>
        <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
          <span>Max Value: {formatCurrency(equity * leverage)}</span>
        </div>
      </div>

      {isBlown && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-lg text-xs font-bold text-center uppercase tracking-wider">
          Account Blown (Margin Call)
        </div>
      )}

      {/* Trading Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => buy(currentPrice)}
          disabled={!currentPrice || isBlown}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-bold transition-all shadow-lg shadow-emerald-900/20 active:scale-95 disabled:opacity-50"
        >
          Buy (Long)
        </button>
        <button
          onClick={() => sell(currentPrice)}
          disabled={!currentPrice || isBlown}
          className="flex items-center justify-center gap-2 bg-[#ef5350] hover:bg-[#d32f2f] text-white py-3 rounded-lg font-bold transition-all shadow-lg shadow-red-900/10 active:scale-95 disabled:opacity-50"
        >
          Sell (Short)
        </button>
        <button
          onClick={() => flat(currentPrice)}
          disabled={position === 'flat' || !currentPrice || isBlown}
          className="col-span-2 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg font-bold transition-all active:scale-95 disabled:opacity-50"
        >
          <CircleOff size={16} />
          Flat Position
        </button>
      </div>

      {/* TP / SL Controls */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          onClick={() => {
            if (position === 'flat' || !currentPrice) return;
            const diff = currentPrice * 0.005;
            setTakeProfit(position === 'long' ? currentPrice + diff : currentPrice - diff);
          }}
          disabled={position === 'flat' || !currentPrice}
          className="flex items-center justify-center gap-2 bg-dark-800 hover:bg-dark-700 text-emerald-400 border border-emerald-900/50 py-2 rounded-lg font-bold transition-all text-xs disabled:opacity-50"
        >
          TP
        </button>
        <button
          onClick={() => {
            if (position === 'flat' || !currentPrice) return;
            const diff = currentPrice * 0.005;
            setStopLoss(position === 'long' ? currentPrice - diff : currentPrice + diff);
          }}
          disabled={position === 'flat' || !currentPrice}
          className="flex items-center justify-center gap-2 bg-dark-800 hover:bg-dark-700 text-red-400 border border-red-900/50 py-2 rounded-lg font-bold transition-all text-xs disabled:opacity-50"
        >
          SL
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
          <span className="text-slate-500">Position Value</span>
          <span className="text-slate-300 font-mono">{formatCurrency(positionValue)}</span>
        </div>
        {/*
        <div className="flex justify-between items-center text-[10px] uppercase font-bold">
          <span className="text-slate-500">Margin Required</span>
          <span className="text-slate-300 font-mono">{formatCurrency(marginRequired)}</span>
        </div>
        */}
        <div className="flex justify-between items-center text-[10px] uppercase font-bold">
          <span className="text-slate-500">Unrealized P&L</span>
          <span className="text-slate-300 font-mono">{unrealizedPnL.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center text-[10px] uppercase font-bold">
          <span className="text-slate-500">Take Profit</span>
          <span className="text-emerald-400 font-mono">{takeProfit ? takeProfit.toFixed(2) : '-'}</span>
        </div>
        <div className="flex justify-between items-center text-[10px] uppercase font-bold">
          <span className="text-slate-500">Stop Loss</span>
          <span className="text-red-400 font-mono">{stopLoss ? stopLoss.toFixed(2) : '-'}</span>
        </div>
      </div>

      <button
        onClick={() => reset()}
        className="w-full mt-2 flex items-center justify-center gap-2 bg-dark-800 hover:bg-dark-700 text-slate-400 border border-dark-700 py-2 rounded-lg font-bold transition-all text-xs active:scale-95"
      >
        Reset Simulation
      </button>

      {isFinished ? (
        <button
          onClick={() => setShowStatsModal(true)}
          className="w-full mt-2 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 text-white py-2.5 rounded-lg font-bold transition-all text-xs shadow-lg shadow-primary-900/20 active:scale-95"
        >
          <BarChart3 size={14} />
          View Statistics
        </button>
      ) : (
        <button
          onClick={() => finishSimulation()}
          className="w-full mt-2 flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white py-2.5 rounded-lg font-bold transition-all text-xs active:scale-95"
        >
          Finish Simulation
        </button>
      )}

    </div>
  );
}
