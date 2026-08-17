import { useChartStyleStore } from '../../store/useChartStyleStore';

interface ChartContainerProps {
  id: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isLoading?: boolean;
  loadingMessage?: string;
}

export function ChartContainer({ id, containerRef, isLoading = false, loadingMessage = 'Loading market data' }: ChartContainerProps) {
  const backgroundColor = useChartStyleStore(state => state.backgroundColor);

  return (
    <div className="absolute inset-0" style={{ backgroundColor }}>
      <div
        id={id}
        className="absolute inset-0"
        ref={containerRef}
      />

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
