import type { IndicatorSeries, IndicatorTemplate } from 'klinecharts';

export interface AnchoredVwapValue {
  value: number | null;
}

/** The selected range is supplied as [startTimestamp, endTimestamp]. */
export const ANCHORED_VWAP_DEFAULT_PARAMS = [] as const;

function getTimestampRange(dataList: { timestamp: number }[], params: unknown[]): [number, number] {
  if (params.length >= 2) {
    const first = Number(params[0]);
    const second = Number(params[1]);
    if (Number.isFinite(first) && Number.isFinite(second)) return [Math.min(first, second), Math.max(first, second)];
  }

  // Keep old chart sessions readable. The previous implementation stored a
  // single lookback count, so interpret it as a range ending at the last bar.
  const anchorBars = Math.max(0, Math.floor(Number(params[0]) || 0));
  const end = dataList[dataList.length - 1]?.timestamp ?? 0;
  const startIndex = anchorBars > 0 ? Math.max(0, dataList.length - anchorBars) : 0;
  return [dataList[startIndex]?.timestamp ?? end, end];
}

function getIndexRange(dataList: { timestamp: number }[], params: unknown[]): [number, number] {
  const [startTimestamp, endTimestamp] = getTimestampRange(dataList, params);
  let start = dataList.findIndex(candle => candle.timestamp >= startTimestamp);
  if (start < 0) start = 0;
  let end = -1;
  for (let index = dataList.length - 1; index >= start; index -= 1) {
    if (dataList[index].timestamp <= endTimestamp) {
      end = index;
      break;
    }
  }
  return [start, end < start ? start : end];
}

/** VWAP recalculated from the range selected by its chart overlay. */
export const ANCHORED_VWAP_INDICATOR: IndicatorTemplate<AnchoredVwapValue> = {
  name: 'AVWAP',
  shortName: 'AVWAP',
  series: 'normal' as IndicatorSeries,
  calcParams: [...ANCHORED_VWAP_DEFAULT_PARAMS],
  shouldOhlc: false,
  precision: 4,
  figures: [{ key: 'value', title: 'AVWAP: ', type: 'line' }],
  calc: (dataList, indicator) => {
    const [anchorIndex, endIndex] = getIndexRange(dataList, indicator.calcParams);
    const result: AnchoredVwapValue[] = dataList.map(() => ({ value: null }));
    let weightedPrice = 0;
    let totalVolume = 0;

    for (let index = anchorIndex; index <= endIndex; index += 1) {
      const candle = dataList[index];
      const volume = Number(candle.volume) || 0;
      if (volume <= 0) {
        result[index] = { value: totalVolume > 0 ? weightedPrice / totalVolume : null };
        continue;
      }
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      weightedPrice += typicalPrice * volume;
      totalVolume += volume;
      result[index] = { value: weightedPrice / totalVolume };
    }
    return result;
  },
};

export { getIndexRange, getTimestampRange };
