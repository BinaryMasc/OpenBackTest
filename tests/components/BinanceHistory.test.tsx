import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from 'klinecharts';
import { ChartGrid } from '../../src/components/ChartGrid';
import { DataSourceSection } from '../../src/components/controls/DataSourceSection';
import { useBacktestStore } from '../../src/store/useBacktestStore';
import { useChartStateStore } from '../../src/store/useChartStateStore';
import { useMarketDataStore } from '../../src/store/useMarketDataStore';

vi.mock('klinecharts', async () => {
  const actual = await vi.importActual<typeof import('klinecharts')>('klinecharts/dist/index.esm.js');
  return { ...actual, init: vi.fn(actual.init) };
});

const DAY_MS = 86_400_000;

function klines(count: number, intervalMs: number): [number, string, string, string, string, string][] {
  return Array.from({ length: count }, (_, index) => [
    (index + 1) * intervalMs, '10', '13', '9', '12', '5'
  ]);
}

function getChart(id = 'chart-1') {
  const callIndex = vi.mocked(init).mock.calls.findLastIndex(([container]) => container === id);
  return vi.mocked(init).mock.results[callIndex].value!;
}

function chartData(id = 'chart-1') {
  return getChart(id).getDataList();
}

function exchangeInfo(symbol: string) {
  return Response.json({ symbols: [{ symbol, status: 'TRADING', contractType: 'PERPETUAL' }] });
}

describe('Binance candle history', () => {
  beforeEach(() => {
    vi.mocked(init).mockClear();
    const noop = () => undefined;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      return new Proxy({ canvas: this, measureText: (text: string) => ({ width: text.length * 7 }) }, {
        get: (target, property) => Reflect.get(target, property) ?? noop,
      }) as unknown as CanvasRenderingContext2D;
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(650);
  });

  afterEach(() => {
    act(() => useMarketDataStore.getState().disconnectSource());
    useMarketDataStore.setState({ binanceHistoryLimits: {} });
    useBacktestStore.setState(useBacktestStore.getInitialState());
    useChartStateStore.setState({ bySymbol: {}, indicators: {} });
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads daily candles in the chart, paginates a larger selection, and updates the live candle', async () => {
    vi.useFakeTimers();
    const minutes = klines(12, 60_000);
    const days = klines(1601, DAY_MS);
    const fetchData = vi.fn(async (url: string) => {
      const { pathname, searchParams } = new URL(url, window.location.href);
      if (pathname.endsWith('/exchangeInfo')) return exchangeInfo('BTCUSDT');
      if (pathname.endsWith('/btc_usdt_m1_jan2025-apr2026.csv')) {
        const start = Date.UTC(2025, 0, 1);
        const rows = Array.from({ length: 102 }, (_, index) => {
          const timestamp = new Date(start + index * 60_000).toISOString().slice(0, -1);
          return `${timestamp},20,22,19,${index === 101 ? 22 : 21},5,BTCUSDT`;
        });
        return new Response(['datetime,open,high,low,close,volume,symbol', ...rows].join('\n'));
      }

      const candles = searchParams.get('interval') === '1d' ? days : minutes;
      const limit = Number(searchParams.get('limit'));
      const endTime = Number(searchParams.get('endTime') ?? Infinity);
      return Response.json(candles.filter(candle => candle[0] <= endTime).slice(-limit));
    });
    vi.stubGlobal('fetch', fetchData);
    render(<><DataSourceSection onOpenRithmicDialog={() => {}} /><ChartGrid /></>);

    await act(() => useMarketDataStore.getState().connectDefaultSource());
    expect(useBacktestStore.getState().currentIndex).toBe(11);

    fireEvent.click(screen.getByRole('button', { name: /^1m$/i }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '1D' })));

    expect(chartData()).toHaveLength(500);
    expect(chartData().at(-1)).toMatchObject({ timestamp: 1601 * DAY_MS, volume: 5 });
    expect(useBacktestStore.getState().rawData).toHaveLength(12);

    await act(async () => useBacktestStore.getState().addChart({ id: 'minute-chart', timeframe: '1m' }));
    const chart = getChart();
    const anchor = 1200 * DAY_MS;
    chart.setBarSpace(10);
    chart.scrollToTimestamp(anchor);
    const visibleEnd = chartData()[chart.getVisibleRange().to - 1].timestamp;
    chart.createOverlay({ id: 'test-drawing', name: 'segment', points: [
      { timestamp: anchor, value: 11 }, { timestamp: anchor + DAY_MS, value: 12 }
    ] });
    chart.createIndicator('MA', true, { id: 'candle_pane' });

    fireEvent.click(screen.getByRole('button', { name: /^1d$/i }));
    const selector = screen.getByRole('combobox', { name: 'History candles' });
    expect(selector).toHaveValue('500');
    await act(async () => fireEvent.change(selector, { target: { value: '5000' } }));

    expect(chartData()).toHaveLength(1601);
    expect(screen.getByText(`${(1601).toLocaleString()} loaded`)).toBeVisible();
    const dailyQueries = fetchData.mock.calls
      .map(([url]) => new URL(url).searchParams)
      .filter(params => params.get('interval') === '1d');
    expect(dailyQueries.map(params => params.get('limit'))).toEqual(['500', '1500', '1500']);
    expect(dailyQueries[2].get('endTime')).toBe(String(102 * DAY_MS - 1));
    expect(chartData()[0].timestamp).toBe(DAY_MS);
    expect(chart.getBarSpace()).toBe(10);
    expect(chartData()[chart.getVisibleRange().to - 1].timestamp).toBe(visibleEnd);
    expect(chart.getOverlayById('test-drawing')?.points[0].timestamp).toBe(anchor);
    expect(chart.getIndicatorByPaneId('candle_pane', 'MA')?.result).toHaveLength(1601);
    expect(chartData('minute-chart')).toHaveLength(12);

    days[1600][4] = '13';
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(chartData()).toHaveLength(1601);
    expect(chartData().at(-1)?.close).toBe(13);

    days.push([1602 * DAY_MS, '13', '15', '12', '14', '3']);
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(chartData()).toHaveLength(1602);
    expect(chartData().at(-1)).toMatchObject({ timestamp: 1602 * DAY_MS, close: 14 });

    days[1600][4] = '12';
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(chartData().at(-2)?.close).toBe(12);
    expect(chartData()[chart.getVisibleRange().to - 1].timestamp).toBe(visibleEnd);

    await act(async () => useBacktestStore.getState().setChartTimeframe('chart-1', '1m'));
    await act(async () => useBacktestStore.getState().setChartTimeframe('chart-1', '1d'));
    await act(() => vi.advanceTimersByTimeAsync(60));
    expect(chart.getVisibleRange().to).toBe(1602);

    fireEvent.click(screen.getByRole('button', { name: 'Preset Data Sets' }));
    fireEvent.click(screen.getByRole('button', { name: 'BTC/USDT 1m (2025-2026)' }));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(useMarketDataStore.getState().isConnected).toBe(false);
    expect(chartData()).toHaveLength(1);
    expect(chartData()[0].close).toBe(21);
    expect(screen.queryByRole('combobox', { name: 'History candles' })).toBeNull();
    expect(chartData('minute-chart')).toHaveLength(101);
    fireEvent.click(screen.getAllByTitle('Step Forward')[0]);
    expect(chartData('minute-chart')).toHaveLength(102);
    expect(chartData()[0].close).toBe(22);
  });

  it('keeps the latest history selection if an older request completes late', async () => {
    let firstSignal: AbortSignal | null | undefined;
    let finishSlowResponse: (response: Response) => void;
    const slowResponse = new Promise<Response>(resolve => {
      finishSlowResponse = resolve;
    });
    const days = klines(700, DAY_MS);
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      const { pathname, searchParams } = new URL(url);
      if (pathname.endsWith('/exchangeInfo')) return exchangeInfo('ETHUSDT');

      if (searchParams.get('interval') === '1m') return Response.json(klines(12, 60_000));
      const limit = Number(searchParams.get('limit'));
      if (limit === 100) {
        firstSignal = options?.signal;
        return slowResponse;
      }
      return Response.json(days.slice(-limit));
    }));
    useBacktestStore.getState().setChartTimeframe('chart-1', '1d');
    render(<ChartGrid />);
    await act(() => useMarketDataStore.getState().connectDefaultSource());

    fireEvent.click(screen.getByRole('button', { name: /^1d$/i }));
    const selector = screen.getByRole('combobox', { name: 'History candles' });
    fireEvent.change(selector, { target: { value: '100' } });
    expect(firstSignal?.aborted).toBe(false);

    await act(async () => fireEvent.change(selector, { target: { value: '1000' } }));
    expect(firstSignal?.aborted).toBe(true);
    expect(chartData()).toHaveLength(700);

    await act(async () => finishSlowResponse(Response.json(days.slice(-100))));
    expect(chartData()).toHaveLength(700);
    expect(selector).toHaveValue('1000');
  });
});
