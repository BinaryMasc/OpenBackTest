import { create } from 'zustand';
import { useBacktestStore } from './useBacktestStore';

export type PositionType = 'long' | 'short' | 'flat';
export interface Trade {
  id: string;
  type: 'buy' | 'sell';
  price: number;
  time: number; // unix timestamp in seconds
  quantity: number;
  realizedPnL: number;
  positionSize: number;
  entryPrice: number | null;
  balance: number;
}

export interface Position {
  id: string;
  type: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number; // Max size reached or total size? Usually total size handled.
  pnl: number;
  openTime: number;
  closeTime: number;
  trades: Trade[];
}

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

  leverage: 150,
  initialBalance: 10000,
  marginBlowoutPercent: 5,
  contractSize: 1,
  feePercent: 0,

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
  clearTradeHistory: () => set({ tradeHistory: [] }),

  buy: (price: number) => {
    const { position, activePositionSize, entryPrice, orderSize, contractSize, leverage, balance, unrealizedPnL, isBlown, feePercent } = get();
    if (isBlown) return;

    const quantity = orderSize;
    const equity = balance + unrealizedPnL;

    // Check Leverage
    const newTotalSize = position === 'long' ? activePositionSize + quantity : quantity;
    const requiredPositionValue = newTotalSize * contractSize * price;
    if (requiredPositionValue > equity * leverage) return; // Prevent trade exceeding leverage

    const fee = quantity * price * contractSize * (feePercent / 100);

    if (position === 'long' && entryPrice !== null) {
      // Averaging UP/DOWN
      const newSize = activePositionSize + quantity;
      const newAvgPrice = (activePositionSize * entryPrice + quantity * price) / newSize;
      set((state) => ({
        activePositionSize: newSize,
        entryPrice: newAvgPrice,
        balance: state.balance - fee,
        realizedPnL: state.realizedPnL - fee,
        hasTraded: true
      }));
    } else if (position === 'short' && entryPrice !== null) {
      // Netting
      if (quantity < activePositionSize) {
        // Partial close
        const profit = (entryPrice - price) * quantity * contractSize;
        set((state) => ({
          balance: state.balance + profit - fee,
          realizedPnL: state.realizedPnL + profit - fee,
          activePositionSize: state.activePositionSize - quantity,
          hasTraded: true
        }));
      } else if (quantity === activePositionSize) {
        // Full close
        const profit = (entryPrice - price) * quantity * contractSize;
        set((state) => {
          const backtestTime = useBacktestStore.getState().getCurrentTickTime();
          const trade: Trade = {
            id: Math.random().toString(36).substring(2, 9),
            type: 'buy',
            price,
            time: backtestTime || (Date.now() / 1000),
            quantity,
            realizedPnL: 0,
            positionSize: 0,
            entryPrice: null,
            balance: 0
          };
          const finalTrade: Trade = {
            ...trade,
            realizedPnL: profit - fee,
            positionSize: 0,
            entryPrice: null,
            balance: state.balance + profit - fee
          };
          const newTrades = [...state.currentPositionTrades, finalTrade];
          const totalEntryQty = newTrades.filter(t => t.type === 'sell').reduce((acc, t) => acc + t.quantity, 0);
          const avgEntryPrice = newTrades.filter(t => t.type === 'sell').reduce((acc, t) => acc + t.price * t.quantity, 0) / totalEntryQty;
          const totalExitQty = newTrades.filter(t => t.type === 'buy').reduce((acc, t) => acc + t.quantity, 0);
          const avgExitPrice = newTrades.filter(t => t.type === 'buy').reduce((acc, t) => acc + t.price * t.quantity, 0) / totalExitQty;

          const finishedPos: Position = {
            id: Math.random().toString(36).substring(2, 9),
            type: 'short',
            entryPrice: avgEntryPrice,
            exitPrice: avgExitPrice,
            quantity: totalEntryQty,
            pnl: newTrades.reduce((acc, t) => acc + t.realizedPnL, 0),
            openTime: newTrades[0].time,
            closeTime: trade.time,
            trades: newTrades
          };

          return {
            balance: state.balance + profit - fee,
            realizedPnL: state.realizedPnL + profit - fee,
            position: 'flat',
            activePositionSize: 0,
            entryPrice: null,
            unrealizedPnL: 0,
            takeProfit: null,
            stopLoss: null,
            hasTraded: true,
            tradeHistory: [...state.tradeHistory, finalTrade],
            currentPositionTrades: [],
            finishedPositions: [...state.finishedPositions, finishedPos]
          };
        });
        return; // Skip default
      } else {
        // Flip position
        const profit = (entryPrice - price) * activePositionSize * contractSize;
        const remainder = quantity - activePositionSize;
        
        // Record finished short position
        const backtestTime = useBacktestStore.getState().getCurrentTickTime();
        const closeTrade: Trade = {
          id: Math.random().toString(36).substring(2, 9),
          type: 'buy',
          price,
          time: backtestTime || (Date.now() / 1000),
          quantity: activePositionSize,
          realizedPnL: 0,
          positionSize: 0,
          entryPrice: null,
          balance: 0
        };
        const openTrade: Trade = {
          id: Math.random().toString(36).substring(2, 9),
          type: 'buy',
          price,
          time: backtestTime || (Date.now() / 1000),
          quantity: remainder,
          realizedPnL: 0,
          positionSize: 0,
          entryPrice: null,
          balance: 0
        };

        set((state) => {
          const finalCloseTrade: Trade = { ...closeTrade, realizedPnL: profit - (fee * (activePositionSize / quantity)), positionSize: 0, entryPrice: null, balance: state.balance + profit - (fee * (activePositionSize / quantity)) };
          const finalOpenTrade: Trade = { ...openTrade, realizedPnL: -(fee * (remainder / quantity)), positionSize: remainder, entryPrice: price, balance: state.balance + profit - fee };
          
          const newTradesForShort = [...state.currentPositionTrades, finalCloseTrade];
          const totalEntryQty = newTradesForShort.filter(t => t.type === 'sell').reduce((acc, t) => acc + t.quantity, 0);
          const avgEntryPrice = newTradesForShort.filter(t => t.type === 'sell').reduce((acc, t) => acc + t.price * t.quantity, 0) / totalEntryQty;
          const totalExitQty = newTradesForShort.filter(t => t.type === 'buy').reduce((acc, t) => acc + t.quantity, 0);
          const avgExitPrice = newTradesForShort.filter(t => t.type === 'buy').reduce((acc, t) => acc + t.price * t.quantity, 0) / totalExitQty;

          const finishedPos: Position = {
            id: Math.random().toString(36).substring(2, 9),
            type: 'short',
            entryPrice: avgEntryPrice,
            exitPrice: avgExitPrice,
            quantity: totalEntryQty,
            pnl: newTradesForShort.reduce((acc, t) => acc + t.realizedPnL, 0),
            openTime: newTradesForShort[0].time,
            closeTime: closeTrade.time,
            trades: newTradesForShort
          };

          return {
            balance: state.balance + profit - fee,
            realizedPnL: state.realizedPnL + profit - fee,
            position: 'long',
            activePositionSize: remainder,
            entryPrice: price,
            unrealizedPnL: 0,
            takeProfit: null,
            stopLoss: null,
            hasTraded: true,
            tradeHistory: [...state.tradeHistory, finalCloseTrade, finalOpenTrade],
            currentPositionTrades: [finalOpenTrade],
            finishedPositions: [...state.finishedPositions, finishedPos]
          };
        });
        return;
      }
    } else {
      // Open new Long
      set((state) => ({
        position: 'long',
        entryPrice: price,
        activePositionSize: quantity,
        unrealizedPnL: 0,
        balance: state.balance - fee,
        realizedPnL: state.realizedPnL - fee,
        hasTraded: true
      }));
    }

    // Record trade
    const backtestTime = useBacktestStore.getState().getCurrentTickTime();
    const trade: Trade = {
      id: Math.random().toString(36).substring(2, 9),
      type: 'buy',
      price,
      time: backtestTime || (Date.now() / 1000),
      quantity,
      realizedPnL: 0,
      positionSize: activePositionSize,
      entryPrice: entryPrice,
      balance: balance
    };

    set((state) => {
      const newCurrentPositionTrades = [...state.currentPositionTrades, trade];
      const currentTrade: Trade = {
        ...trade,
        realizedPnL: position === 'flat' ? -fee : (position === 'long' ? -fee : (quantity <= activePositionSize ? (entryPrice! - price) * quantity * contractSize - fee : (entryPrice! - price) * activePositionSize * contractSize - fee)),
        positionSize: get().activePositionSize,
        entryPrice: get().entryPrice,
        balance: get().balance
      };
      return { 
        tradeHistory: [...state.tradeHistory, currentTrade],
        currentPositionTrades: newCurrentPositionTrades
      };
    });
  },

  sell: (price: number) => {
    const { position, activePositionSize, entryPrice, orderSize, contractSize, leverage, balance, unrealizedPnL, isBlown, feePercent } = get();
    if (isBlown) return;

    const quantity = orderSize;
    const equity = balance + unrealizedPnL;

    // Check Leverage
    const newTotalSize = position === 'short' ? activePositionSize + quantity : quantity;
    const requiredPositionValue = newTotalSize * contractSize * price;
    if (requiredPositionValue > equity * leverage) return; // Prevent trade exceeding leverage

    const fee = quantity * price * contractSize * (feePercent / 100);

    if (position === 'short' && entryPrice !== null) {
      // Averaging UP/DOWN
      const newSize = activePositionSize + quantity;
      const newAvgPrice = (activePositionSize * entryPrice + quantity * price) / newSize;
      set((state) => ({
        activePositionSize: newSize,
        entryPrice: newAvgPrice,
        balance: state.balance - fee,
        realizedPnL: state.realizedPnL - fee,
        hasTraded: true
      }));
    } else if (position === 'long' && entryPrice !== null) {
      // Netting
      if (quantity < activePositionSize) {
        // Partial close
        const profit = (price - entryPrice) * quantity * contractSize;
        set((state) => ({
          balance: state.balance + profit - fee,
          realizedPnL: state.realizedPnL + profit - fee,
          activePositionSize: state.activePositionSize - quantity,
          hasTraded: true
        }));
      } else if (quantity === activePositionSize) {
        // Full close
        const profit = (price - entryPrice) * quantity * contractSize;
        set((state) => {
          const backtestTime = useBacktestStore.getState().getCurrentTickTime();
          const trade: Trade = {
            id: Math.random().toString(36).substring(2, 9),
            type: 'sell',
            price,
            time: backtestTime || (Date.now() / 1000),
            quantity,
            realizedPnL: 0,
            positionSize: 0,
            entryPrice: null,
            balance: 0
          };
          const finalTrade: Trade = {
            ...trade,
            realizedPnL: profit - fee,
            positionSize: 0,
            entryPrice: null,
            balance: state.balance + profit - fee
          };
          const newTrades = [...state.currentPositionTrades, finalTrade];
          const totalEntryQty = newTrades.filter(t => t.type === 'buy').reduce((acc, t) => acc + t.quantity, 0);
          const avgEntryPrice = newTrades.filter(t => t.type === 'buy').reduce((acc, t) => acc + t.price * t.quantity, 0) / totalEntryQty;
          const totalExitQty = newTrades.filter(t => t.type === 'sell').reduce((acc, t) => acc + t.quantity, 0);
          const avgExitPrice = newTrades.filter(t => t.type === 'sell').reduce((acc, t) => acc + t.price * t.quantity, 0) / totalExitQty;

          const finishedPos: Position = {
            id: Math.random().toString(36).substring(2, 9),
            type: 'long',
            entryPrice: avgEntryPrice,
            exitPrice: avgExitPrice,
            quantity: totalEntryQty,
            pnl: newTrades.reduce((acc, t) => acc + t.realizedPnL, 0),
            openTime: newTrades[0].time,
            closeTime: trade.time,
            trades: newTrades
          };

          return {
            balance: state.balance + profit - fee,
            realizedPnL: state.realizedPnL + profit - fee,
            position: 'flat',
            activePositionSize: 0,
            entryPrice: null,
            unrealizedPnL: 0,
            takeProfit: null,
            stopLoss: null,
            hasTraded: true,
            tradeHistory: [...state.tradeHistory, finalTrade],
            currentPositionTrades: [],
            finishedPositions: [...state.finishedPositions, finishedPos]
          };
        });
        return; // Skip default
      } else {
        // Flip position
        const profit = (price - entryPrice) * activePositionSize * contractSize;
        const remainder = quantity - activePositionSize;

        // Record finished long position
        const backtestTime = useBacktestStore.getState().getCurrentTickTime();
        const closeTrade: Trade = {
          id: Math.random().toString(36).substring(2, 9),
          type: 'sell',
          price,
          time: backtestTime || (Date.now() / 1000),
          quantity: activePositionSize,
          realizedPnL: 0,
          positionSize: 0,
          entryPrice: null,
          balance: 0
        };
        const openTrade: Trade = {
          id: Math.random().toString(36).substring(2, 9),
          type: 'sell',
          price,
          time: backtestTime || (Date.now() / 1000),
          quantity: remainder,
          realizedPnL: 0,
          positionSize: 0,
          entryPrice: null,
          balance: 0
        };

        set((state) => {
          const finalCloseTrade: Trade = { ...closeTrade, realizedPnL: profit - (fee * (activePositionSize / quantity)), positionSize: 0, entryPrice: null, balance: state.balance + profit - (fee * (activePositionSize / quantity)) };
          const finalOpenTrade: Trade = { ...openTrade, realizedPnL: -(fee * (remainder / quantity)), positionSize: remainder, entryPrice: price, balance: state.balance + profit - fee };

          const newTradesForLong = [...state.currentPositionTrades, finalCloseTrade];
          const totalEntryQty = newTradesForLong.filter(t => t.type === 'buy').reduce((acc, t) => acc + t.quantity, 0);
          const avgEntryPrice = newTradesForLong.filter(t => t.type === 'buy').reduce((acc, t) => acc + t.price * t.quantity, 0) / totalEntryQty;
          const totalExitQty = newTradesForLong.filter(t => t.type === 'sell').reduce((acc, t) => acc + t.quantity, 0);
          const avgExitPrice = newTradesForLong.filter(t => t.type === 'sell').reduce((acc, t) => acc + t.price * t.quantity, 0) / totalExitQty;

          const finishedPos: Position = {
            id: Math.random().toString(36).substring(2, 9),
            type: 'long',
            entryPrice: avgEntryPrice,
            exitPrice: avgExitPrice,
            quantity: totalEntryQty,
            pnl: newTradesForLong.reduce((acc, t) => acc + t.realizedPnL, 0),
            openTime: newTradesForLong[0].time,
            closeTime: closeTrade.time,
            trades: newTradesForLong
          };

          return {
            balance: state.balance + profit - fee,
            realizedPnL: state.realizedPnL + profit - fee,
            position: 'short',
            activePositionSize: remainder,
            entryPrice: price,
            unrealizedPnL: 0,
            takeProfit: null,
            stopLoss: null,
            hasTraded: true,
            tradeHistory: [...state.tradeHistory, finalCloseTrade, finalOpenTrade],
            currentPositionTrades: [finalOpenTrade],
            finishedPositions: [...state.finishedPositions, finishedPos]
          };
        });
        return;
      }
    } else {
      // Open new Short
      set((state) => ({
        position: 'short',
        entryPrice: price,
        activePositionSize: quantity,
        unrealizedPnL: 0,
        balance: state.balance - fee,
        realizedPnL: state.realizedPnL - fee,
        hasTraded: true
      }));
    }

    // Record trade
    const backtestTime = useBacktestStore.getState().getCurrentTickTime();
    const trade: Trade = {
      id: Math.random().toString(36).substring(2, 9),
      type: 'sell',
      price,
      time: backtestTime || (Date.now() / 1000),
      quantity,
      realizedPnL: 0,
      positionSize: activePositionSize,
      entryPrice: entryPrice,
      balance: balance
    };

    set((state) => {
      const currentTrade: Trade = {
        ...trade,
        realizedPnL: position === 'flat' ? -fee : (position === 'short' ? -fee : (quantity <= activePositionSize ? (price - entryPrice!) * quantity * contractSize - fee : (price - entryPrice!) * activePositionSize * contractSize - fee)),
        positionSize: get().activePositionSize,
        entryPrice: get().entryPrice,
        balance: get().balance
      };
      return { 
        tradeHistory: [...state.tradeHistory, currentTrade],
        currentPositionTrades: [...state.currentPositionTrades, trade]
      };
    });
  },

  flat: (price: number) => {
    const { position, activePositionSize, entryPrice, contractSize, feePercent } = get();
    if (position === 'flat' || entryPrice === null) return;

    let profit = 0;
    if (position === 'long') {
      profit = (price - entryPrice) * activePositionSize * contractSize;
    } else if (position === 'short') {
      profit = (entryPrice - price) * activePositionSize * contractSize;
    }

    const fee = activePositionSize * price * contractSize * (feePercent / 100);

    set((state) => {
      const posType = state.position as 'long' | 'short';

      const backtestTime = useBacktestStore.getState().getCurrentTickTime();
      const finalTrade: Trade = {
        id: Math.random().toString(36).substring(2, 9),
        type: posType === 'long' ? 'sell' : 'buy',
        price,
        time: backtestTime || (Date.now() / 1000),
        quantity: activePositionSize,
        realizedPnL: profit - fee,
        positionSize: 0,
        entryPrice: null,
        balance: state.balance + profit - fee
      };

      const newTrades = [...state.currentPositionTrades, finalTrade];
      
      // Calculate finished position
      const totalEntryQty = newTrades.filter(t => t.type === (posType === 'long' ? 'buy' : 'sell')).reduce((acc, t) => acc + t.quantity, 0);
      const avgEntryPrice = newTrades.filter(t => t.type === (posType === 'long' ? 'buy' : 'sell')).reduce((acc, t) => acc + t.price * t.quantity, 0) / totalEntryQty;
      const totalExitQty = newTrades.filter(t => t.type === (posType === 'long' ? 'sell' : 'buy')).reduce((acc, t) => acc + t.quantity, 0);
      const avgExitPrice = newTrades.filter(t => t.type === (posType === 'long' ? 'sell' : 'buy')).reduce((acc, t) => acc + t.price * t.quantity, 0) / totalExitQty;

      const finishedPos: Position = {
        id: Math.random().toString(36).substring(2, 9),
        type: posType,
        entryPrice: avgEntryPrice,
        exitPrice: avgExitPrice,
        quantity: totalEntryQty,
        pnl: newTrades.reduce((acc, t) => acc + t.realizedPnL, 0),
        openTime: newTrades[0].time,
        closeTime: finalTrade.time,
        trades: newTrades
      };

      return {
        balance: state.balance + profit - fee,
        realizedPnL: state.realizedPnL + profit - fee,
        position: 'flat',
        entryPrice: null,
        activePositionSize: 0,
        unrealizedPnL: 0,
        takeProfit: null,
        stopLoss: null,
        tradeHistory: [...state.tradeHistory, finalTrade],
        currentPositionTrades: [],
        finishedPositions: [...state.finishedPositions, finishedPos]
      };
    });
  },

  updateUnrealizedPnL: (currentPrice: number) => {
    const { position, entryPrice, activePositionSize, takeProfit, stopLoss, flat, contractSize, balance, /*marginBlowoutPercent,*/ isBlown } = get();
    if (position === 'flat' || entryPrice === null || isBlown) {
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
      upnl = (currentPrice - entryPrice) * activePositionSize * contractSize;
    } else if (position === 'short') {
      upnl = (entryPrice - currentPrice) * activePositionSize * contractSize;
    }

    const equity = balance + upnl;
    // const positionValue = activePositionSize * currentPrice * contractSize;
    // const marginRequired = positionValue * (marginBlowoutPercent / 100);

    if (equity <= 0) {
      // Account Blown (Equity <= 0)
      flat(currentPrice); // Close at current price
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

  reset: () => set((state) => ({
    balance: state.initialBalance,
    realizedPnL: 0,
    unrealizedPnL: 0,
    position: 'flat',
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
  })),

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
  }
}));
