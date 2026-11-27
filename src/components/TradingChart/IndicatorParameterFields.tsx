import type { CustomIndicatorDefinition } from '../../lib/chart/indicatorDefinition';
import { getIndicatorParameters } from '../../lib/chart/indicatorParameters';
import type { IndicatorInstance } from '../../types/indicatorTypes';

interface ParameterProps {
  instance: IndicatorInstance;
  definition?: CustomIndicatorDefinition;
  onChange: (params: number[]) => void;
}

export function IndicatorParameterFields({ instance, definition, onChange }: ParameterProps) {
  const { fields, resetParams } = getIndicatorParameters(instance, definition);

  function editParameter(field: (typeof fields)[number], value: number) {
    if (!Number.isFinite(value)) return;
    if (field.integer && !Number.isInteger(value)) return;
    if (field.min !== undefined && value < field.min) return;
    if (field.max !== undefined && value > field.max) return;
    const next = [...instance.calcParams];
    next[field.index] = value;
    onChange(next);
  }

  return (
    <>
      {fields.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs text-slate-400">Parameters</legend>
          {fields.map(field => (
            <label key={field.index} className="flex items-center gap-2 text-xs text-slate-500">
              <span className="min-w-[60px]">{field.label}</span>
              {field.options ? (
                <select value={field.value} onChange={e => editParameter(field, Number(e.target.value))}
                  className="min-w-0 flex-1 rounded bg-dark-700 px-2 py-1 text-slate-200">
                  {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : <input max={field.max} step={field.integer ? 1 : 'any'} type="number" value={field.value} min={field.min ?? 1}
                onChange={e => editParameter(field, Number(e.target.value))}
                className="min-w-0 flex-1 bg-dark-700 border border-dark-600 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-primary-500 transition-colors" />}
            </label>
          ))}
        </fieldset>
      )}
      {definition?.parameterHelp && <p className="text-[11px] leading-4 text-slate-500">{definition.parameterHelp}</p>}
      {resetParams && (
        <button onClick={() => onChange(resetParams)}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors text-left">
          Reset to defaults
        </button>
      )}
    </>
  );
}
