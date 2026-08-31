import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerOverlay } from 'klinecharts';
import { clampAnchoredRangeToData, registerCustomOverlays } from '../../../src/lib/chart/overlays';

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
  bounding?: { width: number; height?: number; top?: number; bottom?: number };
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
      'anchoredVWAPRange', 'anchoredVolumeProfileRange',
      'rect', 'pencil', 'fibonacciLine', 'circle', 'text',
      'positionLine', 'brokerLine', 'tpLine', 'slLine', 'measurement', 'trade', 'tradeArrow'
    ]);
    expect(configFor('rect').totalStep).toBe(3);
    expect(configFor('pencil').totalStep).toBe(1);
    expect(configFor('measurement').totalStep).toBe(3);
    expect(configFor('trade').totalStep).toBe(4);
    expect(configFor('anchoredVWAPRange').totalStep).toBe(3);
    expect(configFor('anchoredVolumeProfileRange').totalStep).toBe(3);
  });

  it('draws anchored indicator ranges across the chart width', () => {
    const config = configFor('anchoredVWAPRange');
    const figures = config.createPointFigures({
      coordinates: [point(20, 80), point(120, 140)],
      bounding: { width: 640, top: 0, bottom: 400 },
      overlay: { extendData: { label: 'Selected VWAP range', color: '#00ff00' } },
    });

    expect(figures).toHaveLength(5);
    expect(figures[0]).toMatchObject({
      type: 'polygon',
      styles: { style: 'stroke_fill', borderColor: '#00ff00' },
    });
    expect(figures[0].attrs.coordinates).toEqual([
      { x: 20, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 400 }, { x: 20, y: 400 },
    ]);
    expect(figures[3]).toMatchObject({ type: 'circle', styles: { color: 'transparent' } });

    const activeFigures = config.createPointFigures({
      coordinates: [point(20, 80), point(120, 140)],
      bounding: { width: 640, top: 0, bottom: 400 },
      overlay: { extendData: { showHandles: true, color: '#00ff00' } },
    });
    expect(activeFigures[3]).toMatchObject({ type: 'circle', styles: { color: '#00ff00' } });
  });

  it('clamps only the dragged anchor beyond the last candle', () => {
    const overlay = {
      id: 'range-1',
      points: [point(3, 100, 100, 3), point(8, 120, 120, 8)],
    };
    const updated = { ...overlay, points: [] as Point[] };
    const chart = {
      getDataList: () => [{ timestamp: 1 }, { timestamp: 2 }, { timestamp: 3 }, { timestamp: 4 }, { timestamp: 5 }, { timestamp: 6 }],
      overrideOverlay: vi.fn(({ points }: { points: Point[] }) => { updated.points = points; }),
      getOverlayById: vi.fn(() => updated),
    };

    const result = clampAnchoredRangeToData(chart as never, overlay as never);

    expect(chart.overrideOverlay).toHaveBeenCalledWith({
      id: 'range-1',
      points: [
        expect.objectContaining({ dataIndex: 3, timestamp: 4 }),
        expect.objectContaining({ dataIndex: 5, timestamp: 6 }),
      ],
    });
    expect(result.points.map(point => point.dataIndex)).toEqual([3, 5]);
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
    expect(figures[1].styles).toMatchObject({
      color: '#f8fafc',
      backgroundColor: '#0f172a',
      borderColor: color,
      borderSize: 1,
    });
  });

  it('uses a high-contrast label for broker position and order levels', () => {
    const figures = configFor('brokerLine').createPointFigures({
      coordinates: [point(0, 50)],
      bounding: { width: 640 },
      overlay: { extendData: { color: '#2DC08E', text: 'LONG 2 @ 100 | OPEN', dashed: false } },
    });

    expect(figures[0].styles).toMatchObject({ style: 'solid', color: '#2DC08E' });
    expect(figures[1].styles).toMatchObject({
      color: '#f8fafc',
      backgroundColor: '#0f172a',
      borderColor: '#2DC08E',
      borderSize: 1,
    });
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

  it('draws a label-free trade position with customizable fill-only zones', () => {
    const config = configFor('trade');
    expect(config.createPointFigures({ coordinates: [point(10, 100, 100)] })).toEqual([]);

    const figures = config.createPointFigures({
      coordinates: [point(10, 100, 100), point(70, 40, 120), point(70, 160, 90)],
      overlay: {
        points: [point(10, 100, 100), point(70, 40, 120), point(70, 160, 90)],
      },
      precision: { price: 2 },
    });

    expect(figures).toHaveLength(2);
    expect(figures[0]).toMatchObject({
      type: 'polygon',
      attrs: { coordinates: [{ x: 10, y: 100 }, { x: 70, y: 100 }, { x: 70, y: 40 }, { x: 10, y: 40 }] },
      styles: { style: 'fill', color: 'rgba(34, 197, 94, 0.24)', borderSize: 0 },
    });
    expect(figures[1]).toMatchObject({
      type: 'polygon',
      attrs: { coordinates: [{ x: 10, y: 100 }, { x: 70, y: 100 }, { x: 70, y: 160 }, { x: 10, y: 160 }] },
      styles: { style: 'fill', color: 'rgba(239, 68, 68, 0.24)', borderSize: 0 },
    });

    const shortFigures = config.createPointFigures({
      coordinates: [point(10, 100, 100), point(70, 160, 80), point(70, 40, 110)],
      overlay: {
        points: [point(10, 100, 100), point(70, 160, 80), point(70, 40, 110)],
      },
      precision: { price: 2 },
    });
    expect(shortFigures).toHaveLength(2);
  });

  it('shows the position labels and R:R only while selected', () => {
    const config = configFor('trade');
    const figures = config.createPointFigures({
      coordinates: [point(10, 100, 100), point(70, 40, 120), point(70, 160, 90)],
      overlay: {
        extendData: { selected: true },
        points: [point(10, 100, 100), point(70, 40, 120), point(70, 160, 90)],
      },
      precision: { price: 2 },
    });

    expect(figures.map(figure => figure.type)).toEqual(['polygon', 'polygon', 'text', 'text', 'text']);
    expect(figures[2].attrs.text).toBe('LONG · Entry 100.00 · R:R 2.00');
  });

  it('draws trade arrows in the correct direction and color', () => {
    const config = configFor('tradeArrow');
    expect(config.createPointFigures({ coordinates: [] })).toEqual([]);

    const buy = config.createPointFigures({ coordinates: [point(20, 30)], overlay: { extendData: 'buy' } });
    const sell = config.createPointFigures({ coordinates: [point(20, 30)], overlay: { extendData: 'sell' } });
    expect(buy[0]).toMatchObject({ type: 'polygon', styles: { style: 'fill', color: '#ffffff' } });
    expect(sell[0]).toMatchObject({ type: 'polygon', styles: { style: 'fill', color: '#ffffff' } });
    expect(buy[0].attrs.coordinates).toEqual([{ x: 20, y: 30 }, { x: 14, y: 42 }, { x: 26, y: 42 }]);
    expect(sell[0].attrs.coordinates).toEqual([{ x: 20, y: 30 }, { x: 14, y: 18 }, { x: 26, y: 18 }]);
  });
});
