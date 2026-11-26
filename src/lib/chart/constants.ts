export const DRAWING_GROUP_ID = 'drawing_group';
export const INDICATOR_RANGE_GROUP_ID = 'indicator_range_group';
export const CANDLE_PANE_ID = 'candle_pane';

import { CUSTOM_INDICATORS_LIST, CUSTOM_INDICATOR_PARAMS } from './customIndicators';

// ToDo: Disabled Bollinger Bands (BOLL) and SMA for now
//export const INDICATORS_LIST = ['MA', 'EMA', 'SMA', 'MACD', 'VOL', 'RSI', 'BOLL'] as const;
const NATIVE_INDICATORS = ['MA', 'EMA', 'MACD', 'VOL', 'RSI'] as const;
export const INDICATORS_LIST = [...NATIVE_INDICATORS, ...CUSTOM_INDICATORS_LIST] as const;

export const NATIVE_PARAMETERS: Record<string, [label: string, defaultValue: number][]> = {
  MA: [['Period 1', 5], ['Period 2', 10], ['Period 3', 30], ['Period 4', 60]],
  SMA: [['Period', 14]],
  EMA: [['Period', 14]],
  MACD: [['Fast', 12], ['Slow', 26], ['Signal', 9]],
  VOL: [],
  RSI: [['Period', 14]],
  BOLL: [['Period', 20]],
};

export const DEFAULT_INDICATOR_PARAMS: Record<string, number[]> = {
  ...Object.fromEntries(Object.entries(NATIVE_PARAMETERS).map(([name, params]) =>
    [name, params.map(([, defaultValue]) => defaultValue)],
  )),
  ...CUSTOM_INDICATOR_PARAMS,
};

/** Rotating palette for auto-assigning colors to new indicator instances */
export const INDICATOR_DEFAULT_COLORS = [
  '#2196F3', // blue
  '#FF9800', // orange
  '#4CAF50', // green
  '#E91E63', // pink
  '#9C27B0', // purple
  '#00BCD4', // cyan
  '#FFEB3B', // yellow
  '#795548', // brown
] as const;
