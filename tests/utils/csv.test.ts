import { describe, expect, it, vi } from 'vitest';
import { parseCandleCsv } from '../../src/utils/csv';

describe('parseCandleCsv', () => {
  it('parses UTC datetimes, sorts by time and extracts the symbol', async () => {
    const csv = [
      'datetime,open,high,low,close,volume,symbol',
      '2025-01-01 00:01:00,2,3,1,2.5,20,BTCUSDT',
      '2025-01-01 00:00:00,1,2,0.5,1.5,10,BTCUSDT',
      '',
    ].join('\r\n');

    const { candles, symbol } = await parseCandleCsv(csv);

    expect(symbol).toBe('BTCUSDT');
    expect(candles).toEqual([
      { time: 1735689600, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
      { time: 1735689660, open: 2, high: 3, low: 1, close: 2.5, volume: 20 },
    ]);
  });

  it('accepts reordered columns and skips rows with invalid dates', async () => {
    const csv = 'close,datetime,open,high,low,volume\n5,not-a-date,1,1,1,1\n6,2025-01-01 00:00:00,4,7,3,9';
    const { candles, symbol } = await parseCandleCsv(csv);
    expect(symbol).toBe('');
    expect(candles).toEqual([{ time: 1735689600, open: 4, high: 7, low: 3, close: 6, volume: 9 }]);
  });

  it('reports progress up to 100% and handles empty input', async () => {
    const onProgress = vi.fn();
    await parseCandleCsv('datetime,open,high,low,close,volume\n2025-01-01 00:00:00,1,1,1,1,1', onProgress);
    expect(onProgress).toHaveBeenLastCalledWith(100);
    expect(await parseCandleCsv('')).toEqual({ candles: [], symbol: '' });
  });
});
