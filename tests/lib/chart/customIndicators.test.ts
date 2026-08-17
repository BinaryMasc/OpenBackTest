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
});
