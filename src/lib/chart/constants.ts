export const CHART_CONTAINER_ID = 'kline-chart-container';
export const DRAWING_GROUP_ID = 'drawing_group';
export const CANDLE_PANE_ID = 'candle_pane';

export const INDICATORS_LIST = ['MA', 'EMA', 'SMA', 'MACD', 'VOL', 'RSI', 'BOLL'] as const;
export type IndicatorName = typeof INDICATORS_LIST[number];

export const OSCILLATOR_INDICATORS = ['VOL', 'RSI', 'MACD'] as const;

export const DEFAULT_INDICATOR_PARAMS: Record<string, number[]> = {
  SMA: [14],
  EMA: [14],
  MA: [5, 10, 30, 60],
  MACD: [12, 26, 9],
  VOL: [5, 10, 20],
  RSI: [6, 12, 24],
  BOLL: [20],
};
