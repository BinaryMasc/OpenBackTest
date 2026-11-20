import { describe, expect, it } from 'vitest';
import type { Candle } from '../../src/types';
import { aggregateCandles } from '../../src/utils/aggregation';
import { getBars, getVisibleSeries, visibleBars } from '../../src/utils/series';

const candles: Candle[] = Array.from({ length: 23 }, (_, i) => ({
  time: 1_700_000_100 + i * 60,
  open: 100 + i,
  high: 105 + i + (i % 3),
  low: 95 + i - (i % 4),
  close: 101 + i,
  volume: i + 1,
}));

describe('visible series', () => {
  it('matches aggregating the visible slice for every cursor and timeframe', () => {
    for (const timeframe of ['1m', '5m', '15m'] as const) {
      for (let cursor = 0; cursor < candles.length; cursor++) {
        const expected = aggregateCandles(candles.slice(0, cursor + 1), timeframe).map(c => ({
          timestamp: c.time * 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
        }));
        expect(visibleBars(getVisibleSeries(candles, timeframe, cursor))).toEqual(expected);
      }
    }
  });

  it('caches bars per data set and timeframe', () => {
    expect(getBars(candles, '5m')).toBe(getBars(candles, '5m'));
    expect(getBars(candles, '5m')).not.toBe(getBars([...candles], '5m'));
  });

  it('returns an empty series without data', () => {
    expect(getVisibleSeries([], '5m', 0).count).toBe(0);
    expect(getVisibleSeries(candles, '5m', -1).last).toBeNull();
  });
});
