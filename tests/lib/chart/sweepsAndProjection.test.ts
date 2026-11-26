import { describe, expect, it, vi } from 'vitest';
import { htfCandle, projectCandles } from '../../../src/lib/chart/indicators/htfCandle';
import { findLiquiditySweeps } from '../../../src/lib/chart/indicators/liquiditySweeps';

describe('liquidity sweeps', () => {
  const bars = [
    [8, 5, 7], [10, 3, 6], [9, 4, 8], [10, 3, 5], [11, 2, 8], [12, 1, 5],
  ].map(([high, low, close]) => ({ high, low, close }));

  it('allows a wick sweep on both sides, once per confirmed level', () => {
    expect(findLiquiditySweeps(bars.slice(0, 4), 1)).toEqual([]);
    expect(findLiquiditySweeps(bars, 1)).toEqual([
      { pivot: 1, end: 4, level: 10, bullish: false },
      { pivot: 1, end: 4, level: 3, bullish: true },
    ]);
  });

  it('consumes a broken high without marking it as swept later', () => {
    const broken = bars.map((bar, i) => i === 4 ? { ...bar, close: 11 } : bar);
    expect(findLiquiditySweeps(broken, 1).filter(event => !event.bullish)).toEqual([]);
  });
});

describe('HTF candle projection', () => {
  const day = 86400000;
  const bars = [
    [0, 10, 15, 8, 12], [day, 12, 14, 7, 9], [2 * day, 9, 13, 8, 13],
    [2 * day + 3600000, 13, 19, 6, 17],
  ].map(([timestamp, open, high, low, close]) => ({ timestamp, open, high, low, close }));

  it('groups the latest N UTC periods chronologically and respects the replay cursor', () => {
    expect(projectCandles(bars.slice(0, 3), '1d', 2).map(c => c.close)).toEqual([9, 13]);
    expect(projectCandles(bars, '1d', 2)).toEqual([
      { ...bars[1], first: 1, highest: 1, lowest: 1 },
      { timestamp: 2 * day, open: 9, high: 19, low: 6, close: 17, first: 2, highest: 3, lowest: 3 },
    ]);
  });

  it('places bodies and wicks after the last real bar and draws guides only for the latest candle', async () => {
    const borders: [string, number[]][] = [];
    let dash = [4, 4];
    const ctx = { save: vi.fn(), restore: vi.fn(), strokeStyle: '', beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillRect: vi.fn(),
      strokeRect: vi.fn(() => borders.push([ctx.strokeStyle, dash])), fillText: vi.fn(), setLineDash: (pattern: number[]) => { dash = pattern; } };
    const indicator = { visible: true, calcParams: [86400, 2, 4],
      extendData: { timeframe: '1h', color: 'green', opacity: 0.7, settings: { downColor: 'red', wick: 'silver', downWick: 'grey', guides: true } } };
    const result = await htfCandle.template.calc(bars, indicator as never);
    expect(result.at(-1)).toMatchObject({ low: 6, high: 19 });
    htfCandle.template.draw!({ ctx, kLineDataList: bars, indicator: { ...indicator, result },
      xAxis: { convertToPixel: (i: number) => i * 10 }, yAxis: { convertToPixel: (p: number) => 100 - p },
      barSpace: { bar: 10 } } as never);
    expect(ctx.fillRect.mock.calls).toEqual([[80, 88, 30, 3], [130, 83, 30, 8]]);
    expect(borders).toEqual([['grey', []], ['silver', []]]);
    expect(ctx.fillText).toHaveBeenCalledTimes(4);
    expect(await htfCandle.template.calc(bars, { ...indicator, extendData: { timeframe: '1d' } } as never)).toEqual([]);
  });
});
