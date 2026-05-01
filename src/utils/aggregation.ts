import type { Candle, Timeframe } from '../types';
import { TIMEFRAME_SECONDS } from '../types';

/**
 * Aggregates an array of base timeframe candles into a higher timeframe.
 * Works perfectly because we calculate the bucket start time using UTC seconds.
 */
export function aggregateCandles(baseCandles: Candle[], targetTimeframe: Timeframe): Candle[] {
  if (baseCandles.length === 0) return [];
  if (targetTimeframe === '1m') return baseCandles; // Assuming base data is 1m

  const tfSeconds = TIMEFRAME_SECONDS[targetTimeframe];
  const aggregated: Candle[] = [];
  
  let currentBucketTime = -1;
  let currentCandle: Candle | null = null;

  for (const candle of baseCandles) {
    const bucketTime = Math.floor(candle.time / tfSeconds) * tfSeconds;

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
