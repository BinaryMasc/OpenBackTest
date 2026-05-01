import { Controls } from './components/Controls';
import { TradingChart } from './components/TradingChart';
import { useBacktestStore } from './store/useBacktestStore';

function App() {
  const symbol = useBacktestStore((state) => state.symbol);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-dark-900 font-sans text-slate-300">
      <Controls />
      <main className="flex-1 flex flex-col relative">
        <div className="absolute inset-0 p-4">
          {symbol && (
            <div className="mb-2 pl-1">
              <span className="text-lg font-semibold text-slate-200">{symbol}</span>
            </div>
          )}
          <div className="w-full h-full border border-dark-700 rounded-xl overflow-hidden shadow-2xl bg-dark-900">
            <TradingChart />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
