import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChartConfig, Timeframe } from '../types';
import type { IndicatorInstance } from '../types/indicatorTypes';

export interface ChartViewState {
  barSpace: number;
  lastVisibleIndex: number;
}

export type StoredTradeMode = 'simulation' | 'live';

export interface StoredTradeArrow {
  id: string;
  side: 'buy' | 'sell';
  price: number;
  time: number;
}

export const EMPTY_STORED_TRADE_ARROWS: StoredTradeArrow[] = [];

export interface SymbolChartState {
  charts: ChartConfig[];
  views: Record<string, ChartViewState>;
  trades: Record<StoredTradeMode, StoredTradeArrow[]>;
}

interface ChartStateStore {
  bySymbol: Record<string, SymbolChartState>;
  indicators: Record<string, IndicatorInstance[]>;
  getStateForSymbol: (symbol: string) => SymbolChartState | undefined;
  getIndicators: (chartId: string, symbol?: string) => IndicatorInstance[];
  getView: (symbol: string, chartId: string, timeframe: Timeframe) => ChartViewState | undefined;
  getTrades: (symbol: string, mode: StoredTradeMode) => StoredTradeArrow[];
  saveCharts: (symbol: string, charts: ChartConfig[]) => void;
  saveIndicators: (chartId: string, indicators: IndicatorInstance[], symbol?: string) => void;
  saveView: (symbol: string, chartId: string, timeframe: Timeframe, view: ChartViewState) => void;
  saveTrades: (symbol: string, mode: StoredTradeMode, trades: StoredTradeArrow[]) => void;
  clearTrades: (symbol: string, mode: StoredTradeMode) => void;
}

const DEFAULT_SYMBOL_KEY = '__default__';
const memoryStorage = new Map<string, string>();

const chartStateStorage = {
  getItem: (name: string) => {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(name);
    return memoryStorage.get(name) ?? null;
  },
  setItem: (name: string, value: string) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(name, value);
      return;
    }
    memoryStorage.set(name, value);
  },
  removeItem: (name: string) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(name);
      return;
    }
    memoryStorage.delete(name);
  }
};

function getSymbolKey(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  return normalized || DEFAULT_SYMBOL_KEY;
}

function createEmptySymbolState(): SymbolChartState {
  return { charts: [], views: {}, trades: { simulation: [], live: [] } };
}

function viewKey(chartId: string, timeframe: Timeframe): string {
  return `${chartId}:${timeframe}`;
}

function indicatorKey(chartId: string, symbol?: string): string {
  return symbol?.trim() ? `${getSymbolKey(symbol)}:${chartId}` : chartId;
}

export const useChartStateStore = create<ChartStateStore>()(
  persist(
    (set, get) => ({
      bySymbol: {},
      indicators: {},

      getStateForSymbol: (symbol: string) => get().bySymbol[getSymbolKey(symbol)],

      getIndicators: (chartId: string, symbol?: string) => {
        const scoped = get().indicators[indicatorKey(chartId, symbol)];
        // Read the old chart-only key so existing saved sessions migrate to a
        // symbol-scoped key the next time the indicator state is saved.
        return scoped ?? get().indicators[chartId] ?? [];
      },

      getView: (symbol: string, chartId: string, timeframe: Timeframe) =>
        get().bySymbol[getSymbolKey(symbol)]?.views?.[viewKey(chartId, timeframe)],

      getTrades: (symbol: string, mode: StoredTradeMode) =>
        get().bySymbol[getSymbolKey(symbol)]?.trades?.[mode] ?? EMPTY_STORED_TRADE_ARROWS,

      saveCharts: (symbol: string, charts: ChartConfig[]) => {
        if (!symbol.trim()) return;
        const key = getSymbolKey(symbol);
        set(state => ({
          bySymbol: {
            ...state.bySymbol,
            [key]: {
              ...(state.bySymbol[key] ?? createEmptySymbolState()),
              charts: charts.map(chart => ({ ...chart }))
            }
          }
        }));
      },

      saveIndicators: (chartId: string, indicators: IndicatorInstance[], symbol?: string) => {
        const key = indicatorKey(chartId, symbol);
        set(state => ({
          indicators: {
            ...state.indicators,
            [key]: indicators.map(indicator => ({
              ...indicator,
              calcParams: [...indicator.calcParams]
            }))
          }
        }));
      },

      saveView: (symbol: string, chartId: string, timeframe: Timeframe, view: ChartViewState) => {
        if (!symbol.trim()) return;
        const key = getSymbolKey(symbol);
        set(state => {
          const current = state.bySymbol[key] ?? createEmptySymbolState();
          return {
            bySymbol: {
              ...state.bySymbol,
              [key]: {
                ...current,
                views: {
                  ...current.views,
                  [viewKey(chartId, timeframe)]: { ...view }
                }
              }
            }
          };
        });
      },

      saveTrades: (symbol: string, mode: StoredTradeMode, trades: StoredTradeArrow[]) => {
        if (!symbol.trim()) return;
        const key = getSymbolKey(symbol);
        set(state => {
          const current = state.bySymbol[key] ?? createEmptySymbolState();
          return {
            bySymbol: {
              ...state.bySymbol,
              [key]: {
                ...current,
                trades: {
                  ...(current.trades ?? { simulation: [], live: [] }),
                  [mode]: trades.map(trade => ({ ...trade }))
                }
              }
            }
          };
        });
      },

      clearTrades: (symbol: string, mode: StoredTradeMode) => {
        if (!symbol.trim()) return;
        const key = getSymbolKey(symbol);
        set(state => {
          const current = state.bySymbol[key];
          if (!current) return state;
          return {
            bySymbol: {
              ...state.bySymbol,
              [key]: {
                ...current,
                trades: {
                  ...(current.trades ?? { simulation: [], live: [] }),
                  [mode]: []
                }
              }
            }
          };
        });
      }
    }),
    {
      name: 'chart-state-storage',
      storage: {
        getItem: (name: string) => {
          const value = chartStateStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: (name: string, value: unknown) => {
          chartStateStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name: string) => chartStateStorage.removeItem(name)
      },
      partialize: state => ({ bySymbol: state.bySymbol, indicators: state.indicators })
    }
  )
);

export { getSymbolKey };
