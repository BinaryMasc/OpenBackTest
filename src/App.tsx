import { Controls } from './components/Controls';
import { TradingChart } from './components/TradingChart';

function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-dark-900 font-sans text-slate-300">
      <Controls />
      <main className="flex-1 flex flex-col relative">
        <div className="absolute inset-0 p-4">
          <div className="w-full h-full border border-dark-700 rounded-xl overflow-hidden shadow-2xl bg-dark-900">
            <TradingChart />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
