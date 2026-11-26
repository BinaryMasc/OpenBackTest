import { DEFAULT_INDICATOR_PARAMS, NATIVE_PARAMETERS } from './constants';
import type { CustomIndicatorDefinition, IndicatorParameter } from './indicatorDefinition';
import type { IndicatorInstance } from '../../types/indicatorTypes';

export function getIndicatorParameters({ name, calcParams }: IndicatorInstance, definition?: CustomIndicatorDefinition) {
  const prefix = definition?.parameterPrefix?.(calcParams) ?? [];
  const fields: (IndicatorParameter & { index: number; value: number })[] = [];
  calcParams.forEach((value, index) => {
    const parameter = index < prefix.length ? prefix[index] : definition?.parameters?.[index - prefix.length];
    if (parameter === null) return;
    const label = parameter?.label ?? NATIVE_PARAMETERS[name]?.[index]?.[0] ?? `Param ${index + 1}`;
    fields.push({ ...parameter, label, index, value });
  });

  const defaults = DEFAULT_INDICATOR_PARAMS[name];
  const resetParams = defaults?.length ? [...calcParams.slice(0, prefix.length), ...defaults] : undefined;
  return { fields, resetParams };
}
