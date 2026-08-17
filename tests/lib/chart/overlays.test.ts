import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerOverlay } from 'klinecharts';
import { registerCustomOverlays } from '../../../src/lib/chart/overlays';

vi.mock('klinecharts', () => ({
  registerOverlay: vi.fn(),
}));

type Point = { x: number; y: number; value?: number; dataIndex?: number };
type Figure = {
  type: string;
  attrs: Record<string, unknown>;
  styles?: Record<string, unknown>;
};
type OverlayParams = {
  coordinates: Point[];
  overlay?: {
    extendData?: unknown;
    points?: Point[];
    styles?: Record<string, unknown>;
  };
  bounding?: { width: number };
  precision?: { price: number };
};
type OverlayConfig = {
  name: string;
  totalStep?: number;
  createPointFigures: (params: OverlayParams) => Figure[];
};

const registered = vi.mocked(registerOverlay);
const point = (x: number, y: number, value = y, dataIndex = x) => ({ x, y, value, dataIndex });

function configFor(name: string): OverlayConfig {
  const call = registered.mock.calls.find(([config]) => config.name === name);
  if (!call) throw new Error(`Overlay ${name} was not registered`);
  return call[0] as unknown as OverlayConfig;
}

describe('custom overlay renderers', () => {
  beforeEach(() => {
    registered.mockReset();
    registerCustomOverlays();
  });

  it('registers every custom overlay with the expected drawing step', () => {
    expect(registered.mock.calls.map(([config]) => config.name)).toEqual([
      'rect', 'pencil', 'fibonacciLine', 'circle', 'text',
      'positionLine', 'tpLine', 'slLine', 'measurement', 'tradeArrow'
    ]);
    expect(configFor('rect').totalStep).toBe(3);
    expect(configFor('pencil').totalStep).toBe(1);
    expect(configFor('measurement').totalStep).toBe(3);
  });

  it('draws a rectangle only after two points are available', () => {
    const config = configFor('rect');
    expect(config.createPointFigures({ coordinates: [point(1, 2)] })).toEqual([]);

    const figures = config.createPointFigures({ coordinates: [point(1, 2), point(5, 8)] });
    expect(figures).toHaveLength(1);
    expect(figures[0]).toMatchObject({ type: 'polygon', styles: { style: 'stroke_fill' } });
    expect(figures[0].attrs.coordinates).toEqual([
      { x: 1, y: 2, value: 2, dataIndex: 1 },
      { x: 5, y: 2 },
      { x: 5, y: 8, value: 8, dataIndex: 5 },
      { x: 1, y: 8 },
    ]);
  });

  it('draws pencil points as one solid line', () => {
    const config = configFor('pencil');
    expect(config.createPointFigures({ coordinates: [point(1, 2)] })).toEqual([]);
    const coordinates = [point(1, 2), point(3, 4), point(5, 6)];
    expect(config.createPointFigures({ coordinates })).toEqual([
      { type: 'line', attrs: { coordinates }, styles: { style: 'solid' } }
    ]);
  });

  it('draws Fibonacci guide, levels, and labels using the configured color', () => {
    const config = configFor('fibonacciLine');
    const figures = config.createPointFigures({
      coordinates: [point(10, 100), point(110, 0)],
      overlay: { styles: { line: { color: 'rgba(10, 20, 30, 0.8)' } } }
    });

    expect(figures).toHaveLength(15);
    expect(figures[0]).toMatchObject({
      type: 'line',
      attrs: { coordinates: [{ x: 10, y: 100 }, { x: 110, y: 0 }] },
      styles: { style: 'dashed', color: 'rgba(10, 20, 30, 0.3)' }
    });
    expect(figures[1]).toMatchObject({ type: 'line', attrs: { coordinates: [{ x: 10, y: 100 }, { x: 110, y: 100 }] } });
    expect(figures[2]).toMatchObject({ type: 'text', attrs: { text: '0.0%' } });
    expect(figures[13]).toMatchObject({ type: 'line', attrs: { coordinates: [{ x: 10, y: 0 }, { x: 110, y: 0 }] } });
    expect(figures[14]).toMatchObject({ type: 'text', attrs: { text: '100.0%' } });
  });

  it('draws a circle with the radius from its two points', () => {
    const config = configFor('circle');
    expect(config.createPointFigures({ coordinates: [point(1, 1)] })).toEqual([]);
    const figures = config.createPointFigures({
      coordinates: [point(10, 20), point(13, 24)],
      overlay: { styles: { circle: { color: '#abc' } } }
    });
    expect(figures).toEqual([{
      type: 'circle',
      attrs: { x: 10, y: 20, r: 5 },
      styles: { color: '#abc', style: 'stroke_fill' }
    }]);
  });

  it('renders editable text content and text styles', () => {
    const config = configFor('text');
    expect(config.createPointFigures({ coordinates: [] })).toEqual([]);
    const figures = config.createPointFigures({
      coordinates: [point(12, 30)],
      overlay: { extendData: 'Entry', styles: { text: { color: '#ff0', size: 18 } } }
    });
    expect(figures[0]).toMatchObject({
      type: 'text',
      attrs: { x: 12, y: 30, text: 'Entry', align: 'left', baseline: 'top' },
      styles: { color: '#ff0', size: 18, backgroundColor: 'transparent' }
    });
  });

  it.each([
    ['positionLine', '#123456', 'Position: +10'],
    ['tpLine', '#4caf50', 'TP: 110'],
    ['slLine', '#f44336', 'SL: 90'],
  ])('renders %s as a full-width labelled level', (name, color, text) => {
    const config = configFor(name);
    expect(config.createPointFigures({ coordinates: [] })).toEqual([]);
    const figures = config.createPointFigures({
      coordinates: [point(0, 50)],
      bounding: { width: 640 },
      overlay: name === 'positionLine'
        ? { extendData: { color, text } }
        : { extendData: text }
    });
    expect(figures).toHaveLength(2);
    expect(figures[0].attrs.coordinates).toEqual([{ x: 0, y: 50 }, { x: 640, y: 50 }]);
    expect(figures[0].styles).toMatchObject({ style: 'dashed', color });
    expect(figures[1].attrs.text).toBe(text);
  });

  it('draws measurement range, percentage, and bar count', () => {
    const config = configFor('measurement');
    expect(config.createPointFigures({ coordinates: [point(1, 2)] })).toEqual([]);
    const figures = config.createPointFigures({
      coordinates: [point(10, 100, 100, 4), point(60, 120, 120, 10)],
      overlay: { points: [{ value: 100, dataIndex: 4 }, { value: 120, dataIndex: 10 }] },
      precision: { price: 2 }
    });
    expect(figures).toHaveLength(4);
    expect(figures[0].type).toBe('polygon');
    expect(figures[1].type).toBe('line');
    expect(figures[2].attrs.text).toBe('+20.00 (+20.00%)');
    expect(figures[3].attrs.text).toBe('6 bars');
  });

  it('draws trade arrows in the correct direction and color', () => {
    const config = configFor('tradeArrow');
    expect(config.createPointFigures({ coordinates: [] })).toEqual([]);

    const buy = config.createPointFigures({ coordinates: [point(20, 30)], overlay: { extendData: 'buy' } });
    const sell = config.createPointFigures({ coordinates: [point(20, 30)], overlay: { extendData: 'sell' } });
    expect(buy[0]).toMatchObject({ type: 'polygon', styles: { style: 'fill', color: '#22c55e' } });
    expect(sell[0]).toMatchObject({ type: 'polygon', styles: { style: 'fill', color: '#ef4444' } });
    expect(buy[0].attrs.coordinates).toEqual([{ x: 20, y: 30 }, { x: 14, y: 42 }, { x: 26, y: 42 }]);
    expect(sell[0].attrs.coordinates).toEqual([{ x: 20, y: 30 }, { x: 14, y: 18 }, { x: 26, y: 18 }]);
  });
});
