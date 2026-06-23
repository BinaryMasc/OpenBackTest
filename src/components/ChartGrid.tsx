import { useBacktestStore } from '../store/useBacktestStore';
import { TradingChart } from './TradingChart';

export function ChartGrid() {
  const charts = useBacktestStore(state => state.charts);

  const gridColsClass = 
    charts.length === 1 ? 'grid-cols-1' :
    charts.length === 2 ? 'grid-cols-2' :
    'grid-cols-3';

  return (
    <div className={`w-full h-full grid ${gridColsClass} gap-1 p-1 bg-dark-900`}>
      {charts.map(chart => (
        <div key={chart.id} className="w-full h-full min-h-0 border border-dark-700 rounded-xl overflow-hidden shadow-2xl relative">
          <TradingChart id={chart.id} timeframe={chart.timeframe} />
        </div>
      ))}
    </div>
  );
}
