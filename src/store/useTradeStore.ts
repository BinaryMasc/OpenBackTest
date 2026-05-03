import { create } from 'zustand';

export type PositionType = 'long' | 'short' | 'flat';

interface TradeState {
  balance: number;
  realizedPnL: number;
  unrealizedPnL: number;
  position: PositionType;
  entryPrice: number | null;
  positionSize: number;

  buy: (price: number) => void;
  sell: (price: number) => void;
  flat: (price: number) => void;
  updateUnrealizedPnL: (currentPrice: number) => void;
  setPositionSize: (size: number) => void;
  reset: () => void;
}

export const useTradeStore = create<TradeState>((set, get) => ({
  balance: 10000,
  realizedPnL: 0,
  unrealizedPnL: 0,
  position: 'flat',
  entryPrice: null,
  positionSize: 1,

  buy: (price: number) => {
    const { position, positionSize, entryPrice } = get();
    
    if (position === 'short' && entryPrice !== null) {
      // Close short first
      const profit = (entryPrice - price) * positionSize;
      set((state) => ({
        balance: state.balance + profit,
        realizedPnL: state.realizedPnL + profit,
        position: 'long',
        entryPrice: price,
        unrealizedPnL: 0
      }));
    } else if (position === 'flat') {
      set({
        position: 'long',
        entryPrice: price,
        unrealizedPnL: 0
      });
    }
    // If already long, do nothing (or could add to position, but keeping it simple)
  },

  sell: (price: number) => {
    const { position, positionSize, entryPrice } = get();
    
    if (position === 'long' && entryPrice !== null) {
      // Close long first
      const profit = (price - entryPrice) * positionSize;
      set((state) => ({
        balance: state.balance + profit,
        realizedPnL: state.realizedPnL + profit,
        position: 'short',
        entryPrice: price,
        unrealizedPnL: 0
      }));
    } else if (position === 'flat') {
      set({
        position: 'short',
        entryPrice: price,
        unrealizedPnL: 0
      });
    }
  },

  flat: (price: number) => {
    const { position, positionSize, entryPrice } = get();
    if (position === 'flat' || entryPrice === null) return;

    let profit = 0;
    if (position === 'long') {
      profit = (price - entryPrice) * positionSize;
    } else if (position === 'short') {
      profit = (entryPrice - price) * positionSize;
    }

    set((state) => ({
      balance: state.balance + profit,
      realizedPnL: state.realizedPnL + profit,
      position: 'flat',
      entryPrice: null,
      unrealizedPnL: 0
    }));
  },

  updateUnrealizedPnL: (currentPrice: number) => {
    const { position, entryPrice, positionSize } = get();
    if (position === 'flat' || entryPrice === null) {
      set({ unrealizedPnL: 0 });
      return;
    }

    let upnl = 0;
    if (position === 'long') {
      upnl = (currentPrice - entryPrice) * positionSize;
    } else if (position === 'short') {
      upnl = (entryPrice - currentPrice) * positionSize;
    }
    set({ unrealizedPnL: upnl });
  },

  setPositionSize: (size: number) => set({ positionSize: size }),
  
  reset: () => set({
    balance: 10000,
    realizedPnL: 0,
    unrealizedPnL: 0,
    position: 'flat',
    entryPrice: null,
    positionSize: 1
  })
}));
