import { X, Download, TrendingUp, Target, BarChart2, Activity } from 'lucide-react';
import { useTradeStore } from '../store/useTradeStore';
import Papa from 'papaparse';

export function StatsModal() {
  const { showStatsModal, setShowStatsModal, finishedPositions, initialBalance, tradeHistory } = useTradeStore();

  if (!showStatsModal) return null;

  const totalPositions = finishedPositions.length;
  const winningPositions = finishedPositions.filter(p => p.pnl > 0);
  const losingPositions = finishedPositions.filter(p => p.pnl <= 0);

  const winRate = totalPositions > 0 ? (winningPositions.length / totalPositions) * 100 : 0;

  const totalProfit = winningPositions.reduce((acc, p) => acc + p.pnl, 0);
  const totalLoss = Math.abs(losingPositions.reduce((acc, p) => acc + p.pnl, 0));
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

  const avgWin = winningPositions.length > 0 ? totalProfit / winningPositions.length : 0;
  const avgLoss = losingPositions.length > 0 ? totalLoss / losingPositions.length : 0;
  const rr = avgLoss > 0 ? avgWin / avgLoss : 0;

  const netProfit = finishedPositions.reduce((acc, p) => acc + p.pnl, 0);

  // Equity Curve Calculation
  const equityCurve = [initialBalance];
  let currentEquity = initialBalance;
  let maxEquity = initialBalance;
  let maxDrawdown = 0;

  finishedPositions.forEach(p => {
    currentEquity += p.pnl;
    equityCurve.push(currentEquity);
    if (currentEquity > maxEquity) maxEquity = currentEquity;
    const drawdown = maxEquity - currentEquity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  });

  const maxDrawdownPercent = (maxDrawdown / initialBalance) * 100;

  const exportPositions = () => {
    const data = finishedPositions.map(p => ({
      Type: p.type.toUpperCase(),
      EntryPrice: p.entryPrice.toFixed(2),
      ExitPrice: p.exitPrice.toFixed(2),
      Quantity: p.quantity.toFixed(4),
      PnL: p.pnl.toFixed(2),
      OpenTime: new Date(p.openTime * 1000).toISOString(),
      CloseTime: new Date(p.closeTime * 1000).toISOString(),
    }));

    const csv = Papa.unparse(data);
    downloadCSV(csv, `positions_${new Date().getTime()}.csv`);
  };

  const exportTradeLog = () => {
    const data = tradeHistory.map(t => ({
      Time: new Date(t.time * 1000).toISOString(),
      Action: t.type.toUpperCase(),
      Price: t.price.toFixed(2),
      Quantity: t.quantity.toFixed(4),
      'Realized PnL': t.realizedPnL.toFixed(2),
      'Position Size': t.positionSize.toFixed(4),
      'Entry Price': t.entryPrice ? t.entryPrice.toFixed(2) : '-',
      Balance: t.balance.toFixed(2),
    }));

    const csv = Papa.unparse(data);
    downloadCSV(csv, `trade_log_${new Date().getTime()}.csv`);
  };

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // SVG Graph scaling
  const graphWidth = 600;
  const graphHeight = 200;
  const minEq = Math.min(...equityCurve, initialBalance * 0.95);
  const maxEq = Math.max(...equityCurve, initialBalance * 1.05);
  const range = maxEq - minEq;

  const points = equityCurve.map((eq, i) => {
    const x = (i / (equityCurve.length - 1)) * graphWidth;
    const y = graphHeight - ((eq - minEq) / range) * graphHeight;
    return `${x},${y}`;
  }).join(' ');

  const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-dark-800 w-full max-w-5xl rounded-3xl border border-dark-700 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-700 shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              Simulation Statistics
            </h2>
            <p className="text-slate-400 text-sm">Performance summary for the current session</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exportPositions}
              className="flex items-center gap-2 bg-dark-700 hover:bg-dark-600 text-white px-4 py-2 rounded-lg transition-all text-sm font-semibold border border-slate-600/50"
            >
              <Download size={16} />
              Export Positions Summary
            </button>
            <button
              onClick={exportTradeLog}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg transition-all text-sm font-semibold shadow-lg shadow-primary-900/20"
            >
              <Download size={16} />
              Export Trade Log
            </button>
            <button
              onClick={() => setShowStatsModal(false)}
              className="p-2 hover:bg-dark-700 rounded-full text-slate-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 overflow-y-auto">
          {/* Main Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Net Profit"
              value={`$${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              subValue={`${((netProfit / initialBalance) * 100).toFixed(2)}% ROI`}
              color={netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
              icon={<TrendingUp size={20} />}
            />
            <StatCard
              label="Win Rate"
              value={`${winRate.toFixed(1)}%`}
              subValue={`${winningPositions.length}W / ${losingPositions.length}L`}
              color="text-primary-400"
              icon={<Target size={20} />}
            />
            <StatCard
              label="Profit Factor"
              value={profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}
              subValue="Gross Profit / Loss"
              color="text-amber-400"
              icon={<BarChart2 size={20} />}
            />
            <StatCard
              label="Risk / Reward"
              value={rr.toFixed(2)}
              subValue="Avg Win / Avg Loss"
              color="text-indigo-400"
              icon={<Activity size={20} />}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-dark-900/50 rounded-xl p-6 border border-dark-700/50">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4">Detailed Metrics</h3>
              <div className="space-y-4">
                <MetricRow label="Avg Winning Trade" value={`$${avgWin.toFixed(2)}`} color="text-emerald-400" />
                <MetricRow label="Avg Losing Trade" value={`-$${avgLoss.toFixed(2)}`} color="text-red-400" />
                <MetricRow label="Math Expectancy" value={`$${expectancy.toFixed(2)}`} color={expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                <MetricRow label="Max Drawdown ($)" value={`-$${maxDrawdown.toFixed(2)}`} color="text-red-400" />
                <MetricRow label="Max Drawdown (%)" value={`${maxDrawdownPercent.toFixed(2)}%`} color="text-red-400" />
                <MetricRow label="Total Positions" value={totalPositions.toString()} color="text-slate-200" />
                <MetricRow label="Total Trades" value={tradeHistory.length.toString()} color="text-slate-200" />
                {tradeHistory.length > 0 && (
                  <>
                    <MetricRow label="Backtest from" value={new Date(tradeHistory[0].time * 1000).toLocaleString()} color="text-slate-200" />
                    <MetricRow label="Backtest to" value={new Date(tradeHistory[tradeHistory.length - 1].time * 1000).toLocaleString()} color="text-slate-200" />
                  </>
                )}
              </div>
            </div>

            <div className="bg-dark-900/50 rounded-xl p-6 border border-dark-700/50 flex flex-col">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4">Equity Curve</h3>
              <div className="flex-1 min-h-[200px] relative">
                <svg
                  viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                  className="w-full h-full preserve-3d"
                  preserveAspectRatio="none"
                >
                  {/* Horizontal Lines */}
                  <line x1="0" y1={graphHeight - ((initialBalance - minEq) / range) * graphHeight} x2={graphWidth} y2={graphHeight - ((initialBalance - minEq) / range) * graphHeight} stroke="#334155" strokeDasharray="4 4" />

                  {/* Gradient */}
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Area */}
                  <polyline
                    points={`${points} ${graphWidth},${graphHeight} 0,${graphHeight}`}
                    fill="url(#equityGradient)"
                  />

                  {/* Line */}
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="absolute top-0 left-0 text-[10px] text-slate-500">${maxEq.toFixed(0)}</div>
                <div className="absolute bottom-0 left-0 text-[10px] text-slate-500">${minEq.toFixed(0)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-dark-700 bg-dark-900/30 flex justify-end">
          <button
            onClick={() => setShowStatsModal(false)}
            className="bg-primary-600 hover:bg-primary-500 text-white px-8 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-primary-900/20"
          >
            Close Results
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, subValue, color, icon }: { label: string; value: string; subValue: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-dark-900/80 p-5 rounded-2xl border border-dark-700/50 hover:border-primary-500/30 transition-colors">
      <div className="flex items-center gap-2 text-slate-500 mb-2">
        {icon}
        <span className="text-[10px] uppercase font-bold tracking-widest">{label}</span>
      </div>
      <div className={`text-2xl font-mono font-bold ${color} mb-1`}>{value}</div>
      <div className="text-[10px] text-slate-500 font-medium uppercase">{subValue}</div>
    </div>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-dark-700/30 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className={`font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}
