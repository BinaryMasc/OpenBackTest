import type { IndicatorTemplate } from 'klinecharts';
import type { IndicatorInstance } from '../../types/indicatorTypes';

import type { Timeframe } from '../../types';

type SettingField = {
  key: string;
  label: string;
  /** Older saved charts stored this setting directly on the instance. */
  legacyTopLevel?: boolean;
  legacySettingKey?: string;
} & (
  | { type: 'color'; default: string }
  | { type: 'checkbox'; default: boolean }
);

export interface IndicatorParameter {
  label: string;
  min?: number;
  max?: number;
  options?: { label: string; value: number }[];
  integer?: boolean;
}

export interface CustomIndicatorDefinition {
  template: IndicatorTemplate;
  label: string;
  perInstance?: boolean;
  colorLabel?: string;
  defaultColor?: string;
  defaultOpacity?: number;
  settings?: SettingField[];
  parameters?: IndicatorParameter[];
  /** Leading calculation values preserved on reset. A null field is edited on the chart. */
  parameterPrefix?: (values: number[]) => (IndicatorParameter | null)[];
  parameterHelp?: string;
  rightMargin?: (params: number[], timeframe: Timeframe) => { bars: number; pixels: number } | undefined;
  formatParams?: (params: number[]) => string;
}

/** Apply field defaults on creation and upgrade older settings on restore. */
export function resolveIndicatorSettings(instance: IndicatorInstance, definition?: CustomIndicatorDefinition): IndicatorInstance {
  if (!definition?.settings?.length) return instance;
  const saved: IndicatorInstance & Record<string, unknown> = { ...instance };
  const settings = { ...instance.settings };
  for (const field of definition.settings) {
    let value: unknown = settings[field.key];
    if (field.legacySettingKey) value ??= instance.settings?.[field.legacySettingKey];
    if (field.legacyTopLevel) {
      value ??= saved[field.key];
      delete saved[field.key];
    }
    if (field.type === 'checkbox') {
      settings[field.key] = typeof value === 'boolean' ? value : field.default;
    } else {
      settings[field.key] = typeof value === 'string' ? value : field.default;
    }
  }
  return { ...saved, settings };
}
