import { create } from 'zustand';

export type PositionType = 'long' | 'short' | 'flat';

interface TradeState {
  balance: number;
  realizedPnL: number;
  unrealizedPnL: number;
  position: PositionType;
  entryPrice: number | null;
  activePositionSize: number;
  orderSize: number;

  takeProfit: number | null;
  stopLoss: number | null;

  buy: (price: number) => void;
  sell: (price: number) => void;
  flat: (price: number) => void;
  updateUnrealizedPnL: (currentPrice: number) => void;
  setOrderSize: (size: number) => void;
  setTakeProfit: (price: number | null) => void;
  setStopLoss: (price: number | null) => void;
  reset: () => void;
}

export const useTradeStore = create<TradeState>((set, get) => ({
  balance: 10000,
  realizedPnL: 0,
  unrealizedPnL: 0,
  position: 'flat',
  entryPrice: null,
  activePositionSize: 0,
  orderSize: 1,
  takeProfit: null,
  stopLoss: null,

  buy: (price: number) => {
    const { position, activePositionSize, entryPrice, orderSize } = get();
    const quantity = orderSize;
    
    if (position === 'long' && entryPrice !== null) {
      // Averaging UP/DOWN
      const newSize = activePositionSize + quantity;
      const newAvgPrice = (activePositionSize * entryPrice + quantity * price) / newSize;
      set({
        activePositionSize: newSize,
        entryPrice: newAvgPrice
      });
    } else if (position === 'short' && entryPrice !== null) {
      // Netting
      if (quantity < activePositionSize) {
        // Partial close
        const profit = (entryPrice - price) * quantity;
        set((state) => ({
          balance: state.balance + profit,
          realizedPnL: state.realizedPnL + profit,
          activePositionSize: state.activePositionSize - quantity
        }));
      } else if (quantity === activePositionSize) {
        // Full close
        const profit = (entryPrice - price) * quantity;
        set((state) => ({
          balance: state.balance + profit,
          realizedPnL: state.realizedPnL + profit,
          position: 'flat',
          activePositionSize: 0,
          entryPrice: null,
          unrealizedPnL: 0,
          takeProfit: null,
          stopLoss: null
        }));
      } else {
        // Flip position
        const profit = (entryPrice - price) * activePositionSize;
        const remainder = quantity - activePositionSize;
        set((state) => ({
          balance: state.balance + profit,
          realizedPnL: state.realizedPnL + profit,
          position: 'long',
          activePositionSize: remainder,
          entryPrice: price,
          unrealizedPnL: 0,
          takeProfit: null,
          stopLoss: null
        }));
      }
    } else {
      // Open new Long
      set({
        position: 'long',
        entryPrice: price,
        activePositionSize: quantity,
        unrealizedPnL: 0
      });
    }
  },

  sell: (price: number) => {
    const { position, activePositionSize, entryPrice, orderSize } = get();
    const quantity = orderSize;
    
    if (position === 'short' && entryPrice !== null) {
      // Averaging UP/DOWN
      const newSize = activePositionSize + quantity;
      const newAvgPrice = (activePositionSize * entryPrice + quantity * price) / newSize;
      set({
        activePositionSize: newSize,
        entryPrice: newAvgPrice
      });
    } else if (position === 'long' && entryPrice !== null) {
      // Netting
      if (quantity < activePositionSize) {
        // Partial close
        const profit = (price - entryPrice) * quantity;
        set((state) => ({
          balance: state.balance + profit,
          realizedPnL: state.realizedPnL + profit,
          activePositionSize: state.activePositionSize - quantity
        }));
      } else if (quantity === activePositionSize) {
        // Full close
        const profit = (price - entryPrice) * quantity;
        set((state) => ({
          balance: state.balance + profit,
          realizedPnL: state.realizedPnL + profit,
          position: 'flat',
          activePositionSize: 0,
          entryPrice: null,
          unrealizedPnL: 0,
          takeProfit: null,
          stopLoss: null
        }));
      } else {
        // Flip position
        const profit = (price - entryPrice) * activePositionSize;
        const remainder = quantity - activePositionSize;
        set((state) => ({
          balance: state.balance + profit,
          realizedPnL: state.realizedPnL + profit,
          position: 'short',
          activePositionSize: remainder,
          entryPrice: price,
          unrealizedPnL: 0,
          takeProfit: null,
          stopLoss: null
        }));
      }
    } else {
      // Open new Short
      set({
        position: 'short',
        entryPrice: price,
        activePositionSize: quantity,
        unrealizedPnL: 0
      });
    }
  },

  flat: (price: number) => {
    const { position, activePositionSize, entryPrice } = get();
    if (position === 'flat' || entryPrice === null) return;

    let profit = 0;
    if (position === 'long') {
      profit = (price - entryPrice) * activePositionSize;
    } else if (position === 'short') {
      profit = (entryPrice - price) * activePositionSize;
    }

    set((state) => ({
      balance: state.balance + profit,
      realizedPnL: state.realizedPnL + profit,
      position: 'flat',
      entryPrice: null,
      activePositionSize: 0,
      unrealizedPnL: 0,
      takeProfit: null,
      stopLoss: null
    }));
  },

  updateUnrealizedPnL: (currentPrice: number) => {
    const { position, entryPrice, activePositionSize, takeProfit, stopLoss, flat } = get();
    if (position === 'flat' || entryPrice === null) {
      set({ unrealizedPnL: 0 });
      return;
    }

    // Check TP / SL triggers
    if (position === 'long') {
      if (takeProfit !== null && currentPrice >= takeProfit) {
        flat(takeProfit);
        return;
      }
      if (stopLoss !== null && currentPrice <= stopLoss) {
        flat(stopLoss);
        return;
      }
    } else if (position === 'short') {
      if (takeProfit !== null && currentPrice <= takeProfit) {
        flat(takeProfit);
        return;
      }
      if (stopLoss !== null && currentPrice >= stopLoss) {
        flat(stopLoss);
        return;
      }
    }

    let upnl = 0;
    if (position === 'long') {
      upnl = (currentPrice - entryPrice) * activePositionSize;
    } else if (position === 'short') {
      upnl = (entryPrice - currentPrice) * activePositionSize;
    }
    set({ unrealizedPnL: upnl });
  },

  setOrderSize: (size: number) => set({ orderSize: size }),
  setTakeProfit: (price: number | null) => set({ takeProfit: price }),
  setStopLoss: (price: number | null) => set({ stopLoss: price }),
  
  reset: () => set({
    balance: 10000,
    realizedPnL: 0,
    unrealizedPnL: 0,
    position: 'flat',
    entryPrice: null,
    activePositionSize: 0,
    orderSize: 1,
    takeProfit: null,
    stopLoss: null
  })
}));
