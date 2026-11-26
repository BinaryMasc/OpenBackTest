import type { Candle, Timeframe } from '../types';
import { TIMEFRAME_SECONDS } from '../types';

export function candleBucketStart(time: number, timeframe: Timeframe): number {
  const seconds = TIMEFRAME_SECONDS[timeframe];
  // The Unix epoch was a Thursday. Anchor weekly candles to the following Monday at 00:00 UTC.
  const anchor = timeframe === '1w' ? 4 * TIMEFRAME_SECONDS['1d'] : 0;
  return anchor + Math.floor((time - anchor) / seconds) * seconds;
}

export function aggregateCandles(baseCandles: Candle[], targetTimeframe: Timeframe): Candle[] {
  if (baseCandles.length === 0) return [];
  if (targetTimeframe === '1m') return baseCandles; // Assuming base data is 1m

  const aggregated: Candle[] = [];
  
  let currentBucketTime = -1;
  let currentCandle: Candle | null = null;

  for (const candle of baseCandles) {
    const bucketTime = candleBucketStart(candle.time, targetTimeframe);

    if (bucketTime !== currentBucketTime) {
      if (currentCandle) {
        aggregated.push(currentCandle);
      }
      currentBucketTime = bucketTime;
      currentCandle = {
        time: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      };
    } else if (currentCandle) {
      currentCandle.high = Math.max(currentCandle.high, candle.high);
      currentCandle.low = Math.min(currentCandle.low, candle.low);
      currentCandle.close = candle.close;
      currentCandle.volume += candle.volume;
    }
  }

  // push the last one
  if (currentCandle) {
    aggregated.push(currentCandle);
  }

  return aggregated;
}
