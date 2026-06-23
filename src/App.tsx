import { Controls } from './components/Controls';
import { ChartGrid } from './components/ChartGrid';
import { StatsModal } from './components/StatsModal';
//import { useBacktestStore } from './store/useBacktestStore';

function App() {
  //const symbol = useBacktestStore((state) => state.symbol);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-dark-900 font-sans text-slate-300">
      <Controls />
      <main className="flex-1 flex flex-col relative">
        <div className="absolute inset-0 flex flex-col bg-dark-900">
          <ChartGrid />
        </div>
      </main>
      <StatsModal />
    </div>
  );
}

export default App;
