import { beforeEach, describe, expect, it } from 'vitest';
import { useChartStateStore } from '../../src/store/useChartStateStore';
import { useBacktestStore } from '../../src/store/useBacktestStore';

describe('useChartStateStore', () => {
  beforeEach(() => {
    useChartStateStore.setState({ bySymbol: {}, indicators: {} });
    useBacktestStore.setState({
      symbol: '',
      charts: [{ id: 'chart-1', timeframe: '1m' }]
    });
  });

  it('keeps layout and viewport state per symbol while sharing indicators by chart', () => {
    const indicator = {
      id: 'ema-1',
      name: 'EMA',
      calcParams: [20],
      color: '#ffffff',
      opacity: 1,
      visible: true,
      paneId: 'candle_pane'
    };

    useChartStateStore.getState().saveCharts('ESU6.CME', [
      { id: 'chart-1', timeframe: '5m' },
      { id: 'chart-2', timeframe: '1h' }
    ]);
    useChartStateStore.getState().saveIndicators('chart-1', [indicator]);
    useChartStateStore.getState().saveView('ESU6.CME', 'chart-1', '5m', {
      barSpace: 8,
      lastVisibleIndex: 42
    });

    expect(useChartStateStore.getState().getStateForSymbol('ESU6.CME')).toMatchObject({
      charts: [
        { id: 'chart-1', timeframe: '5m' },
        { id: 'chart-2', timeframe: '1h' }
      ]
    });
    expect(useChartStateStore.getState().getIndicators('chart-1')).toEqual([indicator]);
    expect(useChartStateStore.getState().getView('ESU6.CME', 'chart-1', '5m')).toEqual({
      barSpace: 8,
      lastVisibleIndex: 42
    });
    expect(useChartStateStore.getState().getStateForSymbol('NQ')).toBeUndefined();
  });

  it('restores a saved layout when data for that symbol is loaded', () => {
    useChartStateStore.getState().saveCharts('BTCUSDT', [
      { id: 'chart-1', timeframe: '15m' },
      { id: 'chart-2', timeframe: '1h' }
    ]);

    useBacktestStore.getState().loadData([], 'BTCUSDT');

    expect(useBacktestStore.getState().charts).toEqual([
      { id: 'chart-1', timeframe: '15m' },
      { id: 'chart-2', timeframe: '1h' }
    ]);
  });

  it('keeps persisted simulation and live arrows in separate namespaces', () => {
    useChartStateStore.getState().saveTrades('BTCUSDT', 'simulation', [{
      id: 'sim-1', side: 'buy', price: 100, time: 1000
    }]);
    useChartStateStore.getState().saveTrades('BTCUSDT', 'live', [{
      id: 'live-1', side: 'sell', price: 110, time: 1060
    }]);

    expect(useChartStateStore.getState().getTrades('BTCUSDT', 'simulation')).toEqual([
      { id: 'sim-1', side: 'buy', price: 100, time: 1000 }
    ]);
    expect(useChartStateStore.getState().getTrades('BTCUSDT', 'live')).toEqual([
      { id: 'live-1', side: 'sell', price: 110, time: 1060 }
    ]);
  });
});
