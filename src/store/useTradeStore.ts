import { create } from 'zustand';
import { useBacktestStore } from './useBacktestStore';
import { useChartStateStore } from './useChartStateStore';
import {
  applyFill,
  closeAll,
  triggeredExit,
  unrealizedPnL,
  type OrderSide,
  type Position,
  type PositionType,
  type Trade,
} from '../lib/trading/engine';

function currentSymbol(): string {
  return useBacktestStore.getState().symbol;
}

function currentTickTime(): number {
  return useBacktestStore.getState().getCurrentTickTime() || Date.now() / 1000;
}

/** An open position is locked to the symbol it was opened on. */
function isCurrentSymbol(positionSymbol: string | null): boolean {
  return positionSymbol === null || positionSymbol === currentSymbol();
}

export type { PositionType, Trade, Position } from '../lib/trading/engine';

interface TradeState {
  balance: number;
  realizedPnL: number;
  unrealizedPnL: number;
  position: PositionType;
  positionSymbol: string | null;
  entryPrice: number | null;
  activePositionSize: number;
  orderSize: number;

  takeProfit: number | null;
  stopLoss: number | null;

  leverage: number;
  initialBalance: number;
  marginBlowoutPercent: number;
  contractSize: number;
  feePercent: number;

  isBlown: boolean;
  hasTraded: boolean;
  tradeHistory: Trade[];
  showTradeHistory: boolean;

  isFinished: boolean;
  showStatsModal: boolean;
  finishedPositions: Position[];
  currentPositionTrades: Trade[];

  setLeverage: (val: number) => void;
  setInitialBalance: (val: number) => void;
  setMarginBlowoutPercent: (val: number) => void;
  setContractSize: (val: number) => void;
  setFeePercent: (val: number) => void;
  setShowTradeHistory: (show: boolean) => void;
  clearTradeHistory: () => void;

  buy: (price: number) => void;
  sell: (price: number) => void;
  flat: (price: number) => void;
  updateUnrealizedPnL: (currentPrice: number) => void;
  setOrderSize: (size: number) => void;
  setTakeProfit: (price: number | null) => void;
  setStopLoss: (price: number | null) => void;
  reset: () => void;
  finishSimulation: () => void;
  setShowStatsModal: (show: boolean) => void;
  importState: (state: Partial<TradeState>) => void;
}

export const useTradeStore = create<TradeState>((set, get) => {
  const submitOrder = (side: OrderSide, price: number) => {
    const state = get();
    if (state.isBlown) return;
    if (state.position !== 'flat' && !isCurrentSymbol(state.positionSymbol)) return;

    const quantity = state.orderSize;
    const isAdding = state.position === (side === 'buy' ? 'long' : 'short');
    const resultingSize = isAdding ? state.activePositionSize + quantity : quantity;
    const equity = state.balance + state.unrealizedPnL;
    if (resultingSize * state.contractSize * price > equity * state.leverage) return;

    set(applyFill(state, {
      side,
      price,
      quantity,
      time: currentTickTime(),
      symbol: currentSymbol(),
      contractSize: state.contractSize,
      feePercent: state.feePercent,
    }));
  };

  return {
    balance: 10000,
    realizedPnL: 0,
    unrealizedPnL: 0,
    position: 'flat',
    positionSymbol: null,
    entryPrice: null,
    activePositionSize: 0,
    orderSize: 1,
    takeProfit: null,
    stopLoss: null,

    leverage: 150,
    initialBalance: 10000,
    marginBlowoutPercent: 5,
    contractSize: 1,
    feePercent: 0.02,

    isBlown: false,
    hasTraded: false,
    tradeHistory: [],
    showTradeHistory: false,

    isFinished: false,
    showStatsModal: false,
    finishedPositions: [],
    currentPositionTrades: [],

    setShowTradeHistory: (show: boolean) => set({ showTradeHistory: show }),
    setShowStatsModal: (show: boolean) => set({ showStatsModal: show }),
    clearTradeHistory: () => {
      set({ tradeHistory: [] });
      const symbol = useBacktestStore.getState().symbol;
      if (symbol) useChartStateStore.getState().clearTrades(symbol, 'simulation');
    },

    buy: (price: number) => submitOrder('buy', price),
    sell: (price: number) => submitOrder('sell', price),

    flat: (price: number) => {
      const state = get();
      if (!isCurrentSymbol(state.positionSymbol)) return;
      const update = closeAll(state, {
        price,
        time: currentTickTime(),
        symbol: currentSymbol(),
        contractSize: state.contractSize,
        feePercent: state.feePercent,
      });
      if (update) set(update);
    },

    updateUnrealizedPnL: (currentPrice: number) => {
      const state = get();
      if (state.position === 'flat' || state.entryPrice === null || state.isBlown) {
        set({ unrealizedPnL: 0 });
        return;
      }
      if (!isCurrentSymbol(state.positionSymbol)) return;

      const exitPrice = triggeredExit(state.position, currentPrice, state.takeProfit, state.stopLoss);
      if (exitPrice !== null) {
        state.flat(exitPrice);
        return;
      }

      const upnl = unrealizedPnL(state, currentPrice, state.contractSize, state.feePercent);
      if (state.balance + upnl <= 0) {
        // Account blown: liquidate at the current price.
        state.flat(currentPrice);
        set({ isBlown: true });
        return;
      }

      set({ unrealizedPnL: upnl });
    },

    setOrderSize: (size: number) => set({ orderSize: size }),
    setTakeProfit: (price: number | null) => set({ takeProfit: price }),
    setStopLoss: (price: number | null) => set({ stopLoss: price }),

    setLeverage: (val: number) => set({ leverage: val }),
    setInitialBalance: (val: number) => set({ initialBalance: val }),
    setMarginBlowoutPercent: (val: number) => set({ marginBlowoutPercent: val }),
    setContractSize: (val: number) => set({ contractSize: val }),
    setFeePercent: (val: number) => set({ feePercent: val }),

    reset: () => {
      set(state => ({
        balance: state.initialBalance,
        realizedPnL: 0,
        unrealizedPnL: 0,
        position: 'flat',
        positionSymbol: null,
        entryPrice: null,
        activePositionSize: 0,
        orderSize: 1,
        takeProfit: null,
        stopLoss: null,
        isBlown: false,
        hasTraded: false,
        tradeHistory: [],
        isFinished: false,
        showStatsModal: false,
        finishedPositions: [],
        currentPositionTrades: []
      }));
      const symbol = useBacktestStore.getState().symbol;
      if (symbol) useChartStateStore.getState().clearTrades(symbol, 'simulation');
    },

    finishSimulation: () => {
      const { position, flat, isFinished } = get();
      if (isFinished) return;

      // Close any open position
      if (position !== 'flat') {
        const { rawData, currentIndex } = useBacktestStore.getState();
        const currentPrice = rawData[currentIndex]?.close || 0;
        if (currentPrice > 0) {
          flat(currentPrice);
        }
      }

      // Stop playback
      if (useBacktestStore.getState().isPlaying) {
        useBacktestStore.getState().togglePlayback();
      }

      set({ isFinished: true, showStatsModal: true });
    },

    importState: (state: Partial<TradeState>) => set((prev) => ({ ...prev, ...state }))
  };
});
