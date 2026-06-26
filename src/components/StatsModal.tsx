import { useState, useMemo } from 'react';
import { X, Download, TrendingUp, Target, BarChart2, Activity, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useTradeStore, type Position } from '../store/useTradeStore';
import Papa from 'papaparse';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, addMonths, subMonths } from 'date-fns';

export function StatsModal() {
  const { showStatsModal } = useTradeStore();
  if (!showStatsModal) return null;
  return <StatsModalContent />;
}

function StatsModalContent() {
  const { setShowStatsModal, finishedPositions, initialBalance, tradeHistory } = useTradeStore();

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

  const totalFees = tradeHistory.reduce((acc, t) => acc + (t.fee || 0), 0);

  const netProfit = tradeHistory.length > 0
    ? tradeHistory[tradeHistory.length - 1].balance - initialBalance
    : finishedPositions.reduce((acc, p) => acc + p.pnl, 0);

  const bruteProfit = netProfit + totalFees;

  // Drawdown
  let maxEquity = initialBalance;
  let maxDrawdown = 0;

  if (tradeHistory.length > 0) {
    tradeHistory
      .filter(t => t.positionSize === 0)
      .forEach(t => {
        if (t.balance > maxEquity) maxEquity = t.balance;
        const drawdown = maxEquity - t.balance;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      });
  } else {
    let currentEquity = initialBalance;
    finishedPositions.forEach(p => {
      currentEquity += p.pnl;
      if (currentEquity > maxEquity) maxEquity = currentEquity;
      const drawdown = maxEquity - currentEquity;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });
  }

  const maxDrawdownPercent = (maxDrawdown / initialBalance) * 100;

  const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

  // New Metrics: Avg Time in Trade
  const getAvgDuration = (positions: Position[]) => {
    if (positions.length === 0) return 0;
    const totalDuration = positions.reduce((acc, p) => acc + (p.closeTime - p.openTime), 0);
    return totalDuration / positions.length;
  };

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const avgTimeWin = formatDuration(getAvgDuration(winningPositions));
  const avgTimeLoss = formatDuration(getAvgDuration(losingPositions));

  // New Metrics: Long/Short Distribution
  const longPositions = finishedPositions.filter(p => p.type === 'long');
  const shortPositions = finishedPositions.filter(p => p.type === 'short');
  
  const longWins = longPositions.filter(p => p.pnl > 0).length;
  const longLosses = longPositions.filter(p => p.pnl <= 0).length;
  const shortWins = shortPositions.filter(p => p.pnl > 0).length;
  const shortLosses = shortPositions.filter(p => p.pnl <= 0).length;

  const longProfit = longPositions.filter(p => p.pnl > 0).reduce((acc, p) => acc + p.pnl, 0);
  const longLoss = Math.abs(longPositions.filter(p => p.pnl <= 0).reduce((acc, p) => acc + p.pnl, 0));
  const shortProfit = shortPositions.filter(p => p.pnl > 0).reduce((acc, p) => acc + p.pnl, 0);
  const shortLoss = Math.abs(shortPositions.filter(p => p.pnl <= 0).reduce((acc, p) => acc + p.pnl, 0));

  // Percent Days Win
  const pnlByDayStats = useMemo(() => {
    const map = new Map<string, number>();
    tradeHistory.forEach(t => {
       const dateStr = format(new Date(t.time * 1000), 'yyyy-MM-dd');
       map.set(dateStr, (map.get(dateStr) || 0) + t.realizedPnL);
    });
    return map;
  }, [tradeHistory]);

  const totalTradingDays = pnlByDayStats.size;
  let winningDays = 0;
  pnlByDayStats.forEach(pnl => {
    if (pnl > 0) winningDays++;
  });
  const percentDaysWin = totalTradingDays > 0 ? (winningDays / totalTradingDays) * 100 : 0;

  // Chart Data for Recharts
  const chartData = useMemo(() => {
    const data = [{ time: tradeHistory.length > 0 ? tradeHistory[0].time * 1000 : Date.now(), balance: initialBalance }];
    if (tradeHistory.length > 0) {
      tradeHistory.forEach(t => {
        if (t.positionSize === 0) {
          data.push({ time: t.time * 1000, balance: t.balance });
        }
      });
    } else {
      let currentEquity = initialBalance;
      finishedPositions.forEach(p => {
        currentEquity += p.pnl;
        data.push({ time: p.closeTime * 1000, balance: currentEquity });
      });
    }
    return data;
  }, [tradeHistory, finishedPositions, initialBalance]);

  const minEq = Math.min(...chartData.map(d => d.balance), initialBalance * 0.95);
  const maxEq = Math.max(...chartData.map(d => d.balance), initialBalance * 1.05);

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
      Fee: (t.fee || 0).toFixed(2),
      'Gross PnL': (t.realizedPnL + (t.fee || 0)).toFixed(2),
      'Net PnL': t.realizedPnL.toFixed(2),
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-dark-800 w-full max-w-[1200px] rounded-3xl border border-dark-700 shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
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
              Export Positions
            </button>
            <button
              onClick={exportTradeLog}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg transition-all text-sm font-semibold shadow-lg shadow-primary-900/20"
            >
              <Download size={16} />
              Export Trades
            </button>
            <button
              onClick={() => setShowStatsModal(false)}
              className="p-2 hover:bg-dark-700 rounded-full text-slate-400 hover:text-white transition-colors ml-2"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6 overflow-y-auto">
          {/* Main Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Metrics & Distribution */}
            <div className="flex flex-col gap-6 lg:col-span-1">
              <div className="bg-dark-900/50 rounded-xl p-6 border border-dark-700/50">
                <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4">Detailed Metrics</h3>
                <div className="space-y-3">
                  <MetricRow label="Initial Balance" value={`$${initialBalance.toFixed(2)}`} color="text-slate-200" />
                  <MetricRow label="Final Balance" value={`$${(initialBalance + netProfit).toFixed(2)}`} color="text-slate-200" />
                  <MetricRow label="Gross Profit" value={`$${bruteProfit.toFixed(2)}`} color={bruteProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                  
                  <div className="border-t border-dark-700/50 my-3"></div>
                  
                  <MetricRow label="Avg Win" value={`$${avgWin.toFixed(2)}`} color="text-emerald-400" />
                  <MetricRow label="Avg Loss" value={`-$${avgLoss.toFixed(2)}`} color="text-red-400" />
                  <MetricRow label="Math Expectancy" value={`$${expectancy.toFixed(2)}`} color={expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                  <MetricRow label="% Profitable Days" value={`${percentDaysWin.toFixed(1)}%`} color="text-primary-400" />
                  <MetricRow label="Max Drawdown" value={`${maxDrawdownPercent.toFixed(2)}%`} color="text-red-400" />
                  <MetricRow label="Total Fees" value={`$${totalFees.toFixed(2)}`} color="text-red-400" />
                </div>
              </div>

              <div className="bg-dark-900/50 rounded-xl p-6 border border-dark-700/50">
                <div className="flex items-center gap-2 mb-4 text-slate-400 text-xs font-bold uppercase tracking-widest">
                  <Clock size={16} />
                  <span>Time Metrics</span>
                </div>
                <div className="space-y-3">
                  <MetricRow label="Avg Time in Win" value={avgTimeWin} color="text-emerald-400" />
                  <MetricRow label="Avg Time in Loss" value={avgTimeLoss} color="text-red-400" />
                </div>
              </div>

              <div className="bg-dark-900/50 rounded-xl p-6 border border-dark-700/50">
                <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4">Trade Distribution</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-dark-800 p-3 rounded-lg border border-dark-700 text-center">
                    <div className="text-slate-400 text-xs font-semibold mb-1 uppercase tracking-wider">Longs</div>
                    <div className="text-lg font-mono font-bold text-slate-200">{longPositions.length}</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      <span className="text-emerald-400">{longWins}W</span> / <span className="text-red-400">{longLosses}L</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      <span className="text-emerald-400">+${longProfit.toFixed(0)}</span> / <span className="text-red-400">-${longLoss.toFixed(0)}</span>
                    </div>
                  </div>
                  <div className="bg-dark-800 p-3 rounded-lg border border-dark-700 text-center">
                    <div className="text-slate-400 text-xs font-semibold mb-1 uppercase tracking-wider">Shorts</div>
                    <div className="text-lg font-mono font-bold text-slate-200">{shortPositions.length}</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      <span className="text-emerald-400">{shortWins}W</span> / <span className="text-red-400">{shortLosses}L</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      <span className="text-emerald-400">+${shortProfit.toFixed(0)}</span> / <span className="text-red-400">-${shortLoss.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Chart & Calendar */}
            <div className="flex flex-col gap-6 lg:col-span-2">
              <div className="bg-dark-900/50 rounded-xl p-6 border border-dark-700/50 flex flex-col h-[350px]">
                <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4">Equity Curve</h3>
                <div className="flex-1 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis 
                        dataKey="time" 
                        tickFormatter={(unixTime) => format(new Date(unixTime), 'MMM dd HH:mm')}
                        stroke="#64748b" 
                        fontSize={11}
                        tickMargin={10}
                        minTickGap={30}
                      />
                      <YAxis 
                        domain={[minEq, maxEq]} 
                        tickFormatter={(val) => `$${val.toFixed(0)}`}
                        stroke="#64748b"
                        fontSize={11}
                        width={60}
                        orientation="right"
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                        itemStyle={{ color: '#0ea5e9', fontWeight: 'bold' }}
                        labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                        labelFormatter={(label) => format(new Date(label as number), 'MMM dd, yyyy HH:mm:ss')}
                        formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Balance']}
                      />
                      <Area 
                        type="stepAfter" 
                        dataKey="balance" 
                        stroke="#0ea5e9" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorBalance)" 
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-dark-900/50 rounded-xl p-6 border border-dark-700/50 flex-1 flex flex-col">
                <PnLCalendar tradeHistory={tradeHistory} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Subcomponents ---

function StatCard({ label, value, subValue, color, icon }: { label: string; value: string; subValue: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-dark-900/80 p-5 rounded-2xl border border-dark-700/50 hover:border-primary-500/30 transition-colors">
      <div className="flex items-center gap-2 text-slate-500 mb-2">
        {icon}
        <span className="text-[10px] uppercase font-bold tracking-widest">{label}</span>
      </div>
      <div className={`text-2xl lg:text-3xl font-mono font-bold ${color} mb-1`}>{value}</div>
      <div className="text-[10px] text-slate-500 font-medium uppercase">{subValue}</div>
    </div>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-dark-700/30 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className={`font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}

// --- Calendar Component ---

function PnLCalendar({ tradeHistory }: { tradeHistory: any[] }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (tradeHistory.length > 0) {
      return new Date(tradeHistory[tradeHistory.length - 1].time * 1000);
    }
    return new Date();
  });

  const pnlByDay = useMemo(() => {
    const map = new Map<string, number>();
    tradeHistory.forEach(t => {
       const dateStr = format(new Date(t.time * 1000), 'yyyy-MM-dd');
       map.set(dateStr, (map.get(dateStr) || 0) + t.realizedPnL);
    });
    return map;
  }, [tradeHistory]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    const startDayOfWeek = start.getDay(); 
    const prefixDays = Array.from({ length: startDayOfWeek }).map(() => null);

    return [...prefixDays, ...days];
  }, [currentMonth]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const totalMonthPnL = useMemo(() => {
    let sum = 0;
    pnlByDay.forEach((pnl, dateStr) => {
      if (isSameMonth(new Date(dateStr), currentMonth)) {
        sum += pnl;
      }
    });
    return sum;
  }, [pnlByDay, currentMonth]);

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest">
          <CalendarIcon size={16} />
          <span>Daily PnL</span>
        </div>
        <div className="flex items-center gap-4">
          <div className={`text-sm font-mono font-bold ${totalMonthPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            Month PnL: ${totalMonthPnL.toFixed(2)}
          </div>
          <div className="flex items-center gap-2 bg-dark-800 rounded-lg p-1 border border-dark-700">
            <button onClick={prevMonth} className="p-1 hover:bg-dark-700 rounded text-slate-400 hover:text-white">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold w-24 text-center text-slate-200">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button onClick={nextMonth} className="p-1 hover:bg-dark-700 rounded text-slate-400 hover:text-white">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS.map(day => (
          <div key={day} className="text-center text-[10px] font-bold text-slate-500 uppercase py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 flex-1">
        {calendarDays.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="bg-dark-800/20 rounded-lg" />;
          
          const dateStr = format(day, 'yyyy-MM-dd');
          const pnl = pnlByDay.get(dateStr);
          const hasTraded = pnl !== undefined;
          
          let bgColor = 'bg-dark-800';
          let textColor = 'text-slate-400';
          
          if (hasTraded) {
            if (pnl > 0) {
              bgColor = 'bg-emerald-500/10 border border-emerald-500/30';
              textColor = 'text-emerald-400';
            } else if (pnl < 0) {
              bgColor = 'bg-red-500/10 border border-red-500/30';
              textColor = 'text-red-400';
            } else {
              bgColor = 'bg-slate-500/10 border border-slate-500/30';
              textColor = 'text-slate-300';
            }
          }

          return (
            <div key={dateStr} className={`rounded-lg p-2 flex flex-col justify-between min-h-[60px] ${bgColor}`}>
              <div className="text-[10px] text-slate-500 font-medium">
                {format(day, 'd')}
              </div>
              {hasTraded && (
                <div className={`text-xs font-mono font-bold text-right ${textColor}`}>
                  {pnl > 0 ? '+' : ''}{pnl.toFixed(0)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
