import { describe, expect, it, vi } from 'vitest';
import { findFairValueGaps, FVG_INDICATOR } from '../../../src/lib/chart/indicators/fairValueGap';
import { findStructureBreaks, STRUCTURE_INDICATOR } from '../../../src/lib/chart/indicators/marketStructure';

const bars = [
  { high: 10, low: 7 }, { high: 15, low: 9 }, { high: 16, low: 13 },
  { high: 14, low: 11 }, { high: 13, low: 10 }, { high: 12, low: 8 },
];
const downBars = bars.map(({ high, low }) => ({ high: 30 - low, low: 30 - high }));

describe('fair value gaps', () => {
  it.each([
    { candles: bars, bullish: true, lower: 10, upper: 13 },
    { candles: downBars, bullish: false, lower: 17, upper: 20 },
  ])('extends the zone through partial fills until the far wick boundary is touched (bullish=$bullish)', ({
    candles, bullish, lower, upper,
  }) => {
    expect(findFairValueGaps(candles.slice(0, 2), 0)).toEqual([]);
    for (const [count, end] of [[3, 2], [4, 3], [5, 4], [6, 4]]) {
      expect(findFairValueGaps(candles.slice(0, count), 0)[0]).toEqual({ start: 0, end, lower, upper, bullish });
    }
    expect(findFairValueGaps(candles, 1)[0].end).toBe(3);
    expect(findFairValueGaps(candles, 20)[0].end).toBe(4);
  });

  it('requires a strictly open gap and handles a changing third candle', () => {
    expect(findFairValueGaps([bars[0], bars[1], { high: 15, low: 10 }], 0)).toEqual([]);
    expect(findFairValueGaps([bars[0], bars[1], { high: 15, low: 9 }], 0)).toEqual([]);
  });

  it('draws borderless rectangles across the viewport with each configured color', () => {
    const fills: unknown[][] = [];
    const ctx = {
      fillStyle: '', globalAlpha: 1,
      fillRect(...bounds: number[]) { fills.push([this.fillStyle, ...bounds]); },
    };
    const result = [...findFairValueGaps(bars, 0).slice(0, 1), ...findFairValueGaps(downBars, 0).slice(0, 1)];
    FVG_INDICATOR.draw!({
      ctx, xAxis: { convertToPixel: (i: number) => 5 * i }, yAxis: { convertToPixel: (p: number) => 100 - p },
      visibleRange: { from: 1, to: 4 },
      indicator: { result, extendData: { color: 'green', opacity: 0.4, settings: { downColor: 'red' } } },
    } as never);
    expect(ctx.globalAlpha).toBe(0.4);
    expect(fills).toEqual([['green', 0, 87, 20, 3], ['red', 0, 80, 20, 3]]);
  });
});

const swings = [
  [10, 8, 9], [14, 9, 12], [12, 7, 10], [15, 10, 14.5], [17, 11, 16],
  [15, 9, 12], [18, 10, 17.5], [16, 8, 9], [10, 5, 6],
].map(([high, low, close]) => ({ high, low, close }));

describe('ChoCh-BoS', () => {
  it('breaks each confirmed swing once and classifies continuations and reversals in both directions', () => {
    const breaks = findStructureBreaks(swings, 1);
    expect(breaks).toEqual([
      { start: 1, end: 3, price: 14, direction: 'up', label: 'BoS' },
      { start: 4, end: 6, price: 17, direction: 'up', label: 'BoS' },
      { start: 5, end: 8, price: 9, direction: 'down', label: 'ChoCh' },
    ]);
    const mirrored = swings.map(({ high, low, close }) => ({ high: -low, low: -high, close: -close }));
    expect(findStructureBreaks(mirrored, 1)).toEqual(breaks.map(event => ({
      ...event, direction: event.direction === 'up' ? 'down' : 'up', price: -event.price,
    })));
    for (let count = 0; count <= swings.length; count++) {
      expect(findStructureBreaks(swings.slice(0, count), 1)).toEqual(breaks.filter(event => event.end < count));
    }
    expect(findStructureBreaks(swings, 3)).toEqual([]);
  });

  it.each([true, false])('keeps the swing-to-break line with showLabels=%s', showLabels => {
    const ctx = { beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillText: vi.fn() };
    STRUCTURE_INDICATOR.draw!({
      ctx, xAxis: { convertToPixel: (i: number) => i * 10 }, yAxis: { convertToPixel: (p: number) => 100 - p },
      visibleRange: { from: 2, to: 4 },
      indicator: { result: findStructureBreaks(swings, 1), extendData: { settings: { showLabels } } },
    } as never);
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 86);
    expect(ctx.lineTo).toHaveBeenCalledWith(30, 86);
    expect(ctx.stroke).toHaveBeenCalledOnce();
    if (showLabels) expect(ctx.fillText).toHaveBeenCalledWith('BoS', 20, 84);
    else expect(ctx.fillText).not.toHaveBeenCalled();
  });
});
