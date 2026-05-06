export const CHART_CONTAINER_ID = 'kline-chart-container';
export const DRAWING_GROUP_ID = 'drawing_group';
export const CANDLE_PANE_ID = 'candle_pane';

import { CUSTOM_INDICATORS_LIST, CUSTOM_INDICATOR_PARAMS } from './customIndicators';

// ToDo: Disabled Bollinger Bands (BOLL) and SMA for now
//export const INDICATORS_LIST = ['MA', 'EMA', 'SMA', 'MACD', 'VOL', 'RSI', 'BOLL'] as const;
const NATIVE_INDICATORS = ['MA', 'EMA', 'MACD', 'VOL', 'RSI'] as const;
export const INDICATORS_LIST = [...NATIVE_INDICATORS, ...CUSTOM_INDICATORS_LIST] as const;
export type IndicatorName = typeof INDICATORS_LIST[number];

export const OSCILLATOR_INDICATORS = ['VOL', 'RSI', 'MACD'] as const;

export const DEFAULT_INDICATOR_PARAMS: Record<string, number[]> = {
  MA: [5, 10, 30, 60],
  SMA: [14],
  EMA: [14],
  MACD: [12, 26, 9],
  VOL: [],
  RSI: [14],
  BOLL: [20],
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
