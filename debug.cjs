const { createStore } = require('zustand/vanilla');

const useTradeStore = createStore((set, get) => ({
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

  buy: (price) => {
    const { position, activePositionSize, entryPrice, orderSize, contractSize, leverage, balance, unrealizedPnL, isBlown, feePercent } = get();
    if (isBlown) return;

    const quantity = orderSize;
    const equity = balance + unrealizedPnL;
    
    const newTotalSize = position === 'long' ? activePositionSize + quantity : quantity;
    const requiredPositionValue = newTotalSize * contractSize * price;
    if (requiredPositionValue > equity * leverage) return;

    const fee = quantity * price * contractSize * (feePercent / 100);

    set((state) => ({
      position: 'long',
      entryPrice: price,
      activePositionSize: quantity,
      unrealizedPnL: 0,
      balance: state.balance - fee,
      realizedPnL: state.realizedPnL - fee,
      hasTraded: true
    }));
  },

  flat: (price) => {
    const { position, activePositionSize, entryPrice, contractSize, feePercent } = get();
    if (position === 'flat' || entryPrice === null) return;

    let profit = (price - entryPrice) * activePositionSize * contractSize;
    const fee = activePositionSize * price * contractSize * (feePercent / 100);

    set((state) => ({
      balance: state.balance + profit - fee,
      realizedPnL: state.realizedPnL + profit - fee,
      position: 'flat',
      entryPrice: null,
      activePositionSize: 0,
      unrealizedPnL: 0,
      takeProfit: null,
      stopLoss: null
    }));
  },

  updateUnrealizedPnL: (currentPrice) => {
    const { position, entryPrice, activePositionSize, flat, contractSize, balance, marginBlowoutPercent, isBlown } = get();
    if (position === 'flat' || entryPrice === null || isBlown) {
      set({ unrealizedPnL: 0 });
      return;
    }

    let upnl = (currentPrice - entryPrice) * activePositionSize * contractSize;
    
    const equity = balance + upnl;
    const positionValue = activePositionSize * currentPrice * contractSize;
    const marginRequired = positionValue * (marginBlowoutPercent / 100);

    if (equity <= marginRequired) {
      flat(currentPrice);
      set({ isBlown: true });
      return;
    }

    set({ unrealizedPnL: upnl });
  }
}));

const store = useTradeStore.getState();

// Simulation
console.log("Initial:", store.balance, store.equity);
store.buy(60000);
store.updateUnrealizedPnL(59958.14);

console.log("After tick:");
console.log("Balance:", useTradeStore.getState().balance);
console.log("Unrealized:", useTradeStore.getState().unrealizedPnL);
console.log("Realized:", useTradeStore.getState().realizedPnL);
console.log("isBlown:", useTradeStore.getState().isBlown);

// Let's force a blow
store.updateUnrealizedPnL(50000);
console.log("\nAfter HUGE drop (blow out):");
console.log("Balance:", useTradeStore.getState().balance);
console.log("Unrealized:", useTradeStore.getState().unrealizedPnL);
console.log("Realized:", useTradeStore.getState().realizedPnL);
console.log("isBlown:", useTradeStore.getState().isBlown);

