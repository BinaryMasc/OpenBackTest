import type { KLineData } from 'klinecharts';
import type { Candle, Timeframe } from '../types';
import { TIMEFRAME_SECONDS } from '../types';
import { aggregateCandles } from './aggregation';

/**
 * The part of a data set that is visible at the playback cursor.
 *
 * `bars` is the full aggregation of the whole data set and is shared between
 * renders and charts (never mutate it). Only `last` is rebuilt per tick: it is
 * the bar containing the cursor, aggregated up to the cursor, so a higher
 * timeframe bar "forms" as playback advances.
 */
export interface VisibleSeries {
  bars: KLineData[];
  /** Number of visible bars, including the partial `last` bar. */
  count: number;
  last: KLineData | null;
}

export const EMPTY_SERIES: VisibleSeries = { bars: [], count: 0, last: null };

function toBar(candle: Candle): KLineData {
  return {
    timestamp: candle.time * 1000,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume || 0,
  };
}

const barCache = new WeakMap<Candle[], Map<Timeframe, KLineData[]>>();

/** Aggregated chart bars for a data set, computed once per (data set, timeframe). */
export function getBars(rawData: Candle[], timeframe: Timeframe): KLineData[] {
  let byTimeframe = barCache.get(rawData);
  if (!byTimeframe) {
    byTimeframe = new Map();
    barCache.set(rawData, byTimeframe);
  }
  let bars = byTimeframe.get(timeframe);
  if (!bars) {
    bars = aggregateCandles(rawData, timeframe).map(toBar);
    byTimeframe.set(timeframe, bars);
  }
  return bars;
}

function lowerBound(bars: KLineData[], timestamp: number): number {
  let low = 0;
  let high = bars.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (bars[middle].timestamp < timestamp) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function getVisibleSeries(rawData: Candle[], timeframe: Timeframe, currentIndex: number): VisibleSeries {
  if (rawData.length === 0 || currentIndex < 0) return EMPTY_SERIES;
  const cursor = Math.min(currentIndex, rawData.length - 1);
  const bars = getBars(rawData, timeframe);

  // The base timeframe is not re-bucketed, so bars map 1:1 to raw candles.
  if (timeframe === '1m') {
    return { bars, count: cursor + 1, last: bars[cursor] };
  }

  const bucketSeconds = TIMEFRAME_SECONDS[timeframe];
  const bucketStart = Math.floor(rawData[cursor].time / bucketSeconds) * bucketSeconds;
  let first = cursor;
  while (first > 0 && rawData[first - 1].time >= bucketStart) first--;

  const last: KLineData = { ...toBar(rawData[first]), timestamp: bucketStart * 1000 };
  for (let i = first + 1; i <= cursor; i++) {
    const candle = rawData[i];
    last.high = Math.max(last.high, candle.high);
    last.low = Math.min(last.low, candle.low);
    last.close = candle.close;
    last.volume = (last.volume ?? 0) + (candle.volume || 0);
  }

  return { bars, count: lowerBound(bars, bucketStart * 1000) + 1, last };
}

/** Materializes the visible bars (used when the chart needs a full reload). */
export function visibleBars(series: VisibleSeries): KLineData[] {
  if (!series.last) return [];
  return [...series.bars.slice(0, series.count - 1), series.last];
}
