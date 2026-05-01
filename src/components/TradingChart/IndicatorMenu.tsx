import { X } from 'lucide-react';

interface IndicatorMenuProps {
  indicatorsList: readonly string[];
  activeIndicators: string[];
  indicatorParams: Record<string, number[]>;
  onClose: () => void;
  onToggle: (name: string) => void;
  onUpdateParam: (name: string, index: number, value: number) => void;
}

export function IndicatorMenu({
  indicatorsList,
  activeIndicators,
  indicatorParams,
  onClose,
  onToggle,
  onUpdateParam,
}: IndicatorMenuProps) {
  return (
    <div className="absolute top-4 left-4 bg-dark-800 border border-dark-700 p-4 rounded shadow-2xl z-50 w-72 max-h-[80vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-slate-200">Indicators</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {indicatorsList.map(ind => {
          const isActive = activeIndicators.includes(ind);
          return (
            <div key={ind} className="flex flex-col gap-2 p-2 border border-dark-700 rounded bg-dark-900/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">{ind}</span>
                <button
                  onClick={() => onToggle(ind)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    isActive
                      ? 'bg-danger/20 text-danger border border-danger/30'
                      : 'bg-primary-500/20 text-primary-500 border border-primary-500/30'
                  }`}
                >
                  {isActive ? 'Remove' : 'Add'}
                </button>
              </div>
              {isActive && indicatorParams[ind] && (
                <div className="flex gap-2 items-center flex-wrap mt-1">
                  <span className="text-xs text-slate-500">Params:</span>
                  {indicatorParams[ind].map((param, idx) => (
                    <input
                      key={idx}
                      type="number"
                      value={param}
                      onChange={e => onUpdateParam(ind, idx, Number(e.target.value))}
                      className="w-12 bg-dark-700 border border-dark-600 rounded px-1 py-0.5 text-xs text-slate-200 outline-none focus:border-primary-500"
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
