/**
 * Pure netting engine for the simulation account.
 *
 * The store owns validation (blown account, symbol lock, leverage) and the
 * clock; this module only answers "given the current book and a fill, what is
 * the next book?". Keeping it free of Zustand makes every branch unit-testable.
 */

export type PositionType = 'long' | 'short' | 'flat';
export type OrderSide = 'buy' | 'sell';

export interface Trade {
  id: string;
  type: OrderSide;
  price: number;
  time: number; // unix timestamp in seconds
  quantity: number;
  fee: number;
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
  quantity: number;
  pnl: number;
  openTime: number;
  closeTime: number;
  trades: Trade[];
}

/** The subset of the trade store that the engine reads and writes. */
export interface PositionBook {
  balance: number;
  realizedPnL: number;
  position: PositionType;
  positionSymbol: string | null;
  entryPrice: number | null;
  activePositionSize: number;
  tradeHistory: Trade[];
  currentPositionTrades: Trade[];
  finishedPositions: Position[];
}

export interface BookUpdate extends Partial<PositionBook> {
  unrealizedPnL?: number;
  takeProfit?: null;
  stopLoss?: null;
  hasTraded?: boolean;
}

export interface Fill {
  side: OrderSide;
  price: number;
  quantity: number;
  /** Unix seconds. */
  time: number;
  symbol: string;
  contractSize: number;
  feePercent: number;
}

export function createId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function sideToPosition(side: OrderSide): 'long' | 'short' {
  return side === 'buy' ? 'long' : 'short';
}

export function calculateFee(quantity: number, price: number, contractSize: number, feePercent: number): number {
  return quantity * price * contractSize * (feePercent / 100);
}

/** Profit of one contract unit when a position opened at `entry` is valued at `price`. */
export function pnlPerUnit(position: 'long' | 'short', entry: number, price: number): number {
  return position === 'long' ? price - entry : entry - price;
}

function weightedAverage(trades: Trade[], side: OrderSide): { quantity: number; price: number } {
  let quantity = 0;
  let notional = 0;
  for (const trade of trades) {
    if (trade.type !== side) continue;
    quantity += trade.quantity;
    notional += trade.price * trade.quantity;
  }
  return { quantity, price: notional / quantity };
}

/** Summarizes the trades of a position that has just been closed. */
export function summarizePosition(type: 'long' | 'short', trades: Trade[], closeTime: number): Position {
  const entrySide: OrderSide = type === 'long' ? 'buy' : 'sell';
  const exitSide: OrderSide = type === 'long' ? 'sell' : 'buy';
  const entry = weightedAverage(trades, entrySide);
  const exit = weightedAverage(trades, exitSide);
  return {
    id: createId(),
    type,
    entryPrice: entry.price,
    exitPrice: exit.price,
    quantity: entry.quantity,
    pnl: trades.reduce((total, trade) => total + trade.realizedPnL, 0),
    openTime: trades[0].time,
    closeTime,
    trades,
  };
}

function makeTrade(fill: Fill, fields: Pick<Trade, 'quantity' | 'fee' | 'realizedPnL' | 'positionSize' | 'entryPrice' | 'balance'>): Trade {
  return { id: createId(), type: fill.side, price: fill.price, time: fill.time, ...fields };
}

const CLEARED_POSITION = {
  unrealizedPnL: 0,
  takeProfit: null,
  stopLoss: null,
} as const;

/**
 * Applies a market fill to the book using netting semantics:
 * open, add (average), reduce, close, or flip.
 */
export function applyFill(book: PositionBook, fill: Fill): BookUpdate {
  const { side, price, quantity, contractSize } = fill;
  const fee = calculateFee(quantity, price, contractSize, fill.feePercent);
  const fillDirection = sideToPosition(side);
  const { position, entryPrice, activePositionSize: size, balance } = book;

  // Open a new position.
  if (position === 'flat' || entryPrice === null) {
    const nextBalance = balance - fee;
    const trade = makeTrade(fill, { quantity, fee, realizedPnL: -fee, positionSize: quantity, entryPrice: price, balance: nextBalance });
    return {
      position: fillDirection,
      positionSymbol: fill.symbol,
      entryPrice: price,
      activePositionSize: quantity,
      unrealizedPnL: 0,
      balance: nextBalance,
      realizedPnL: book.realizedPnL - fee,
      hasTraded: true,
      tradeHistory: [...book.tradeHistory, trade],
      currentPositionTrades: [...book.currentPositionTrades, trade],
    };
  }

  // Add to the position and average the entry price.
  if (position === fillDirection) {
    const nextSize = size + quantity;
    const nextEntry = (size * entryPrice + quantity * price) / nextSize;
    const nextBalance = balance - fee;
    const trade = makeTrade(fill, { quantity, fee, realizedPnL: -fee, positionSize: nextSize, entryPrice: nextEntry, balance: nextBalance });
    return {
      activePositionSize: nextSize,
      entryPrice: nextEntry,
      balance: nextBalance,
      realizedPnL: book.realizedPnL - fee,
      hasTraded: true,
      tradeHistory: [...book.tradeHistory, trade],
      currentPositionTrades: [...book.currentPositionTrades, trade],
    };
  }

  const unitPnL = pnlPerUnit(position, entryPrice, price) * contractSize;

  // Reduce the position.
  if (quantity < size) {
    const profit = unitPnL * quantity;
    const nextBalance = balance + profit - fee;
    const nextSize = size - quantity;
    const trade = makeTrade(fill, { quantity, fee, realizedPnL: profit - fee, positionSize: nextSize, entryPrice, balance: nextBalance });
    return {
      balance: nextBalance,
      realizedPnL: book.realizedPnL + profit - fee,
      activePositionSize: nextSize,
      hasTraded: true,
      tradeHistory: [...book.tradeHistory, trade],
      currentPositionTrades: [...book.currentPositionTrades, trade],
    };
  }

  // Close the position, then open the remainder in the other direction.
  const profit = unitPnL * size;
  const remainder = quantity - size;
  const closeFee = fee * (size / quantity);
  const closeTrade = makeTrade(fill, {
    quantity: size,
    fee: closeFee,
    realizedPnL: profit - closeFee,
    positionSize: 0,
    entryPrice: null,
    balance: balance + profit - closeFee,
  });
  const closedTrades = [...book.currentPositionTrades, closeTrade];
  const closed = {
    ...CLEARED_POSITION,
    balance: balance + profit - fee,
    realizedPnL: book.realizedPnL + profit - fee,
    hasTraded: true,
    finishedPositions: [...book.finishedPositions, summarizePosition(position, closedTrades, fill.time)],
  };

  if (remainder === 0) {
    return {
      ...closed,
      position: 'flat',
      positionSymbol: null,
      activePositionSize: 0,
      entryPrice: null,
      tradeHistory: [...book.tradeHistory, closeTrade],
      currentPositionTrades: [],
    };
  }

  const openFee = fee * (remainder / quantity);
  const openTrade = makeTrade(fill, {
    quantity: remainder,
    fee: openFee,
    realizedPnL: -openFee,
    positionSize: remainder,
    entryPrice: price,
    balance: balance + profit - fee,
  });
  return {
    ...closed,
    position: fillDirection,
    positionSymbol: fill.symbol,
    activePositionSize: remainder,
    entryPrice: price,
    tradeHistory: [...book.tradeHistory, closeTrade, openTrade],
    currentPositionTrades: [openTrade],
  };
}

/** Closes the entire open position at `price`. Returns null when flat. */
export function closeAll(book: PositionBook, fill: Omit<Fill, 'side' | 'quantity'>): BookUpdate | null {
  if (book.position === 'flat' || book.entryPrice === null) return null;
  return applyFill(book, {
    ...fill,
    side: book.position === 'long' ? 'sell' : 'buy',
    quantity: book.activePositionSize,
  });
}

/** Unrealized PnL including the estimated exit fee. */
export function unrealizedPnL(
  book: Pick<PositionBook, 'position' | 'entryPrice' | 'activePositionSize'>,
  price: number,
  contractSize: number,
  feePercent: number,
): number {
  if (book.position === 'flat' || book.entryPrice === null) return 0;
  const gross = pnlPerUnit(book.position, book.entryPrice, price) * book.activePositionSize * contractSize;
  return gross - calculateFee(book.activePositionSize, price, contractSize, feePercent);
}

/** Returns the TP/SL level hit at `price`, take profit first. */
export function triggeredExit(
  position: PositionType,
  price: number,
  takeProfit: number | null,
  stopLoss: number | null,
): number | null {
  if (position === 'long') {
    if (takeProfit !== null && price >= takeProfit) return takeProfit;
    if (stopLoss !== null && price <= stopLoss) return stopLoss;
  } else if (position === 'short') {
    if (takeProfit !== null && price <= takeProfit) return takeProfit;
    if (stopLoss !== null && price >= stopLoss) return stopLoss;
  }
  return null;
}
