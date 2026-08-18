import { describe, expect, it } from 'vitest';
import { fillShortCandleGaps } from '../../src/utils/candleGaps';

describe('fillShortCandleGaps', () => {
  const candle = (time: number, close: number) => ({
    time,
    open: close,
    high: close,
    low: close,
    close,
    volume: 10,
  });

  it('fills inactive minutes from the previous close', () => {
    const result = fillShortCandleGaps([
      candle(0, 100),
      candle(180, 103),
    ]);

    expect(result.map(item => item.time)).toEqual([0, 60, 120, 180]);
    expect(result[1]).toMatchObject({ open: 100, high: 100, low: 100, close: 100, volume: 0 });
    expect(result[2]).toMatchObject({ open: 100, high: 100, low: 100, close: 100, volume: 0 });
  });

  it('preserves long session breaks', () => {
    const result = fillShortCandleGaps([
      candle(0, 100),
      candle(13 * 60 * 60, 103),
    ]);

    expect(result).toHaveLength(2);
  });

  it('keeps the latest candle when timestamps are duplicated', () => {
    const result = fillShortCandleGaps([
      candle(0, 100),
      candle(0, 101),
      candle(60, 102),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].close).toBe(101);
  });
});
