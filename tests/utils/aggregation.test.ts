import { describe, expect, it } from 'vitest';
import { aggregateCandles } from '../../src/utils/aggregation';
import type { Candle } from '../../src/types';

const candle = (time: number, open: number, high: number, low: number, close: number, volume: number): Candle => ({
  time, open, high, low, close, volume
});

describe('aggregateCandles', () => {
  it('returns no candles for empty input and the original array for 1m', () => {
    expect(aggregateCandles([], '5m')).toEqual([]);
    const source = [candle(60, 1, 2, 0.5, 1.5, 10)];
    expect(aggregateCandles(source, '1m')).toBe(source);
  });

  it('combines candles in the same UTC bucket', () => {
    const source = [
      candle(61, 100, 105, 99, 103, 2),
      candle(119, 103, 110, 101, 108, 3),
      candle(301, 108, 112, 107, 111, 4)
    ];

    expect(aggregateCandles(source, '5m')).toEqual([
      { time: 0, open: 100, high: 110, low: 99, close: 108, volume: 5 },
      { time: 300, open: 108, high: 112, low: 107, close: 111, volume: 4 }
    ]);
  });
});
