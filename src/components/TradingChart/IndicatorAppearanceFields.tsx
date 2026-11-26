import type { CustomIndicatorDefinition } from '../../lib/chart/indicatorDefinition';
import type { IndicatorChanges, IndicatorInstance } from '../../types/indicatorTypes';

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      {label}
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        className="w-full h-8 cursor-pointer rounded bg-dark-700 border border-dark-600" />
    </label>
  );
}

interface AppearanceProps {
  instance: IndicatorInstance;
  definition?: CustomIndicatorDefinition;
  onChange: (changes: IndicatorChanges) => void;
}

export function IndicatorAppearanceFields({ instance, definition, onChange }: AppearanceProps) {
  return (
    <>
      <ColorField label={definition?.colorLabel ?? 'Color'} value={instance.color}
        onChange={color => onChange({ color })} />
      {definition?.settings?.map(field => {
        const value = instance.settings?.[field.key] ?? field.default;
        const setValue = (value: string | boolean) => onChange({ settings: { [field.key]: value } });
        if (field.type === 'color') {
          return <ColorField key={field.key} label={field.label} value={String(value)} onChange={setValue} />;
        }
        return (
          <label key={field.key} className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={value === true} onChange={e => setValue(e.target.checked)} />
            {field.label}
          </label>
        );
      })}
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Opacity ({Math.round(instance.opacity * 100)}%)
        <input type="range" min="0.1" max="1" step="0.1" value={instance.opacity}
          onChange={e => onChange({ opacity: e.target.valueAsNumber })} className="w-full accent-primary-500" />
      </label>
    </>
  );
}
