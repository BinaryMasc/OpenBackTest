import type { IndicatorSeries, IndicatorTemplate } from 'klinecharts';

export interface AtrValue {
  value: number | null;
}

export const ATR_DEFAULT_PARAMS = [14] as const;

/** Average True Range using Wilder's smoothing. */
export const ATR_INDICATOR: IndicatorTemplate<AtrValue> = {
  name: 'ATR',
  shortName: 'ATR',
  series: 'normal' as IndicatorSeries,
  calcParams: [...ATR_DEFAULT_PARAMS],
  shouldOhlc: false,
  precision: 4,
  figures: [{ key: 'value', title: 'ATR: ', type: 'line' }],
  calc: (dataList, indicator) => {
    const period = Math.max(1, Math.floor(Number(indicator.calcParams[0]) || ATR_DEFAULT_PARAMS[0]));
    const result: AtrValue[] = dataList.map(() => ({ value: null }));
    if (dataList.length === 0) return result;

    const trueRanges = dataList.map((candle, index) => {
      if (index === 0) return candle.high - candle.low;
      const previousClose = dataList[index - 1].close;
      return Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose),
      );
    });

    if (dataList.length < period) return result;

    let atr = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    result[period - 1] = { value: atr };
    for (let index = period; index < trueRanges.length; index += 1) {
      atr = ((atr * (period - 1)) + trueRanges[index]) / period;
      result[index] = { value: atr };
    }
    return result;
  },
};
