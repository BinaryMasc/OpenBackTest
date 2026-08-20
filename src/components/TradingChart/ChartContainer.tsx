import { useChartStyleStore } from '../../store/useChartStyleStore';
import { Focus, RefreshCw } from 'lucide-react';

interface ChartContainerProps {
  id: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isLoading?: boolean;
  loadingMessage?: string;
  onFitChart?: () => void;
  onRefreshData?: () => void;
}

export function ChartContainer({ id, containerRef, isLoading = false, loadingMessage = 'Loading market data', onFitChart, onRefreshData }: ChartContainerProps) {
  const backgroundColor = useChartStyleStore(state => state.backgroundColor);

  return (
    <div className="absolute inset-0" style={{ backgroundColor }}>
      <div
        id={id}
        className="absolute inset-0"
        ref={containerRef}
      />

      <div className="absolute bottom-3 right-3 z-40 flex items-center gap-1 rounded-lg border border-dark-700/80 bg-dark-800/90 p-1 shadow-lg">
        {/* <button
          type="button"
          onClick={onFitChart}
          className="rounded p-1.5 text-slate-400 transition-colors hover:bg-dark-700 hover:text-slate-100"
          title="Fit chart"
          aria-label="Fit chart"
        >
          <Focus size={15} />
        </button> */}
        <button
          type="button"
          onClick={onRefreshData}
          className="rounded p-1.5 text-slate-400 transition-colors hover:bg-dark-700 hover:text-slate-100"
          title="Refresh chart data"
          aria-label="Refresh chart data"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {isLoading && (
        <div
          className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-dark-900/75 backdrop-blur-[1px]"
          role="status"
          aria-label={loadingMessage}
        >
          <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-700/80 bg-dark-800/90 px-6 py-5 shadow-2xl">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-400"
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-slate-200">{loadingMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
