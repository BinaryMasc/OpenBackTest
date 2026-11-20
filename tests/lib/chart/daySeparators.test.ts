import { describe, expect, it, vi } from 'vitest';
import type { IndicatorDrawParams } from 'klinecharts';
import {
  createSessionDayKey,
  DAY_SEPARATOR_INDICATOR,
  DEFAULT_DAY_SEPARATOR_SETTINGS,
  findDayStarts,
  parseSessionStart,
} from '../../../src/lib/chart/indicators/daySeparators';

const utc = (iso: string) => Date.parse(`${iso}Z`);

describe('day separators', () => {
  it('parses session start times', () => {
    expect(parseSessionStart('17:00')).toBe(17 * 60);
    expect(parseSessionStart('9:30')).toBe(9 * 60 + 30);
    expect(parseSessionStart('25:00')).toBe(0);
    expect(parseSessionStart('nope')).toBe(0);
  });

  it('splits days at UTC midnight', () => {
    const dayKey = createSessionDayKey('UTC', '00:00');
    expect(dayKey(utc('2025-03-03T23:59:00'))).not.toBe(dayKey(utc('2025-03-04T00:00:00')));
    expect(dayKey(utc('2025-03-04T00:00:00'))).toBe(dayKey(utc('2025-03-04T23:59:00')));
  });

  it('splits days at a session start in an IANA zone, across DST', () => {
    // CME: the trading day starts at 17:00 Chicago (CST = UTC-6, CDT = UTC-5).
    const dayKey = createSessionDayKey('America/Chicago', '17:00');
    // Winter: 17:00 CST = 23:00 UTC
    expect(dayKey(utc('2025-01-06T22:59:00'))).not.toBe(dayKey(utc('2025-01-06T23:00:00')));
    // Summer: 17:00 CDT = 22:00 UTC
    expect(dayKey(utc('2025-07-07T21:59:00'))).not.toBe(dayKey(utc('2025-07-07T22:00:00')));
    expect(dayKey(utc('2025-07-07T22:00:00'))).toBe(dayKey(utc('2025-07-08T21:59:00')));
  });

  it('falls back to UTC for an unknown timezone', () => {
    const dayKey = createSessionDayKey('Not/AZone', '00:00');
    expect(dayKey(utc('2025-03-04T00:00:00'))).toBe(createSessionDayKey('UTC', '00:00')(utc('2025-03-04T00:00:00')));
  });

  it('finds the first bar of each day in a range', () => {
    const times = [
      utc('2025-03-03T22:00:00'), utc('2025-03-03T23:00:00'),
      utc('2025-03-04T00:00:00'), utc('2025-03-04T01:00:00'),
      utc('2025-03-05T00:00:00'),
    ];
    const dayKey = createSessionDayKey('UTC', '00:00');
    expect(findDayStarts(i => times[i], 0, times.length, dayKey)).toEqual([2, 4]);
    expect(findDayStarts(i => times[i], 3, times.length, dayKey)).toEqual([4]);
  });

  it('draws one vertical line per day boundary and none for daily bars', () => {
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), stroke: vi.fn(), setLineDash: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), strokeStyle: '', globalAlpha: 1, lineWidth: 1,
    };
    const hourly = Array.from({ length: 48 }, (_, i) => ({ timestamp: utc('2025-03-03T12:00:00') + i * 3_600_000 }));
    const params = (kLineDataList: Array<{ timestamp: number }>) => ({
      ctx,
      kLineDataList,
      visibleRange: { from: 0, to: kLineDataList.length },
      bounding: { height: 300 },
      barSpace: { halfBar: 2 },
      xAxis: { convertToPixel: (index: number) => index * 4 },
      indicator: { extendData: { ...DEFAULT_DAY_SEPARATOR_SETTINGS, timezone: 'UTC' } },
    }) as unknown as IndicatorDrawParams<Record<string, never>>;

    DAY_SEPARATOR_INDICATOR.draw!(params(hourly));
    // 12:00 Mar 3 + 12h = Mar 4 00:00 (index 12), + 36h = Mar 5 00:00 (index 36)
    expect(ctx.moveTo.mock.calls).toEqual([[46.5, 0], [142.5, 0]]);
    expect(ctx.lineTo).toHaveBeenCalledWith(46.5, 300);

    ctx.moveTo.mockClear();
    const daily = Array.from({ length: 5 }, (_, i) => ({ timestamp: utc('2025-03-03T00:00:00') + i * 86_400_000 }));
    DAY_SEPARATOR_INDICATOR.draw!(params(daily));
    expect(ctx.moveTo).not.toHaveBeenCalled();
  });
});
