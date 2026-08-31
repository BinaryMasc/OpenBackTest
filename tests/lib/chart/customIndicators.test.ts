import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerIndicator, IndicatorSeries } from 'klinecharts';
import { registerCustomIndicators } from '../../../src/lib/chart/customIndicators';

vi.mock('klinecharts', () => ({
  registerIndicator: vi.fn(),
  IndicatorSeries: { Normal: 'normal' },
}));

const registered = vi.mocked(registerIndicator);
type Indicator = {
  name: string;
  shortName: string;
  series: unknown;
  calcParams: number[];
  shouldOhlc: boolean;
  calc: (dataList: unknown[]) => unknown[];
  draw: (params: unknown) => boolean;
};

function vpvr() {
  const call = registered.mock.calls[0];
  if (!call) throw new Error('VPVR was not registered');
  return call[0] as unknown as Indicator;
}

function registeredByName(name: string) {
  const call = registered.mock.calls.find(([indicator]) => indicator.name === name);
  if (!call) throw new Error(`${name} was not registered`);
  return call[0] as unknown as Indicator;
}

describe('VPVR custom indicator', () => {
  beforeEach(() => {
    registered.mockReset();
    registerCustomIndicators();
  });

  it('registers VPVR and returns one empty result per candle', () => {
    const indicator = vpvr();
    expect(indicator).toMatchObject({
      name: 'VPVR',
      shortName: 'VPVR',
      series: IndicatorSeries.Normal,
      calcParams: [120, 30, 70],
      shouldOhlc: false,
    });
    expect(indicator.calc([{ high: 1 }, { high: 2 }])).toEqual([{}, {}]);
  });

  it('returns false for empty, flat, and zero-volume visible ranges', () => {
    const draw = vpvr().draw;
    const base = {
      ctx: {},
      bounding: { width: 400 },
      yAxis: { convertToPixel: vi.fn() },
      indicator: { calcParams: [4, 30, 70], styles: {} },
    };
    expect(draw({ ...base, visibleRange: { from: 1, to: 1 }, kLineDataList: [] })).toBe(false);
    expect(draw({ ...base, visibleRange: { from: 0, to: 1 }, kLineDataList: [{ high: 10, low: 10, volume: 3 }] })).toBe(false);
    expect(draw({ ...base, visibleRange: { from: 0, to: 1 }, kLineDataList: [{ high: 10, low: 1, volume: 0 }] })).toBe(false);
  });

  it('distributes volume across rows and draws the profile and POC', () => {
    const draw = vpvr().draw;
    const ctx = {
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      setLineDash: vi.fn(),
      stroke: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
    };
    const yAxis = { convertToPixel: (value: number) => value };
    const result = draw({
      ctx,
      yAxis,
      bounding: { width: 400 },
      visibleRange: { from: 0, to: 3 },
      kLineDataList: [
        { high: 110, low: 100, volume: 10 },
        { high: 105, low: 105, volume: 5 },
        { high: 108, low: 102, volume: 8 },
      ],
      indicator: {
        calcParams: [4, 25, 70],
        styles: { lines: [{ color: '#00ff00' }] },
      },
    });

    expect(result).toBe(true);
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.moveTo).toHaveBeenCalledOnce();
    expect(ctx.lineTo).toHaveBeenCalledOnce();
    expect(ctx.strokeStyle).toBe('#ef4444');
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
    expect(ctx.stroke).toHaveBeenCalledOnce();
  });

  it('draws an anchored profile from the selected range start', () => {
    const draw = registeredByName('AVP').draw;
    const ctx = {
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      setLineDash: vi.fn(),
      stroke: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
    };

    draw({
      ctx,
      yAxis: { convertToPixel: (value: number) => value },
      xAxis: { convertToPixel: (value: number) => 100 + value * 20 },
      bounding: { width: 400 },
      barSpace: { bar: 20, halfBar: 10, gapBar: 4, halfGapBar: 2 },
      visibleRange: { from: 0, to: 10 },
      kLineDataList: [
        { timestamp: 1, high: 110, low: 100, volume: 10 },
        { timestamp: 2, high: 105, low: 101, volume: 5 },
        { timestamp: 3, high: 108, low: 102, volume: 8 },
      ],
      indicator: {
        calcParams: [2, 3, 120, 30, 70],
        styles: { lines: [{ color: '#00ff00' }] },
      },
    });

    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fillRect.mock.calls[0][0]).toBe(120);
    expect(ctx.moveTo.mock.calls[0][0]).toBe(120);
  });
});

describe('additional custom indicators', () => {
  beforeEach(() => {
    registered.mockReset();
    registerCustomIndicators();
  });

  it('registers anchored VWAP, anchored volume profile, and ATR independently', () => {
    expect(registered.mock.calls.map(([indicator]) => indicator.name)).toEqual(['VPVR', 'AVWAP', 'AVP', 'ATR']);
    expect(registeredByName('AVWAP').calcParams).toEqual([]);
    expect(registeredByName('AVP').calcParams).toEqual([120, 30, 70]);
    expect(registeredByName('ATR').calcParams).toEqual([14]);
  });

  it('calculates anchored VWAP from the selected anchor and Wilder ATR', () => {
    const candles = [
      { timestamp: 1, open: 9, high: 10, low: 8, close: 9, volume: 2 },
      { timestamp: 2, open: 10, high: 12, low: 9, close: 11, volume: 1 },
      { timestamp: 3, open: 11, high: 13, low: 10, close: 12, volume: 1 },
    ];
    const avwap = registeredByName('AVWAP');
    const atr = registeredByName('ATR');

    expect(avwap.calc(candles, { calcParams: [2, 3] } as never)).toEqual([
      { value: null },
      { value: (9 + 11 + 12) / 3 },
      { value: (((9 + 11 + 12) / 3) + ((10 + 12 + 13) / 3)) / 2 },
    ]);
    expect(atr.calc(candles, { calcParams: [2] } as never)).toEqual([
      { value: null },
      { value: 2.5 },
      { value: 2.75 },
    ]);
  });
});
