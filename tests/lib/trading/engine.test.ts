import { describe, expect, it } from 'vitest';
import {
  applyFill,
  closeAll,
  triggeredExit,
  unrealizedPnL,
  type Fill,
  type PositionBook,
} from '../../../src/lib/trading/engine';

const EMPTY_BOOK: PositionBook = {
  balance: 1000,
  realizedPnL: 0,
  position: 'flat',
  positionSymbol: null,
  entryPrice: null,
  activePositionSize: 0,
  tradeHistory: [],
  currentPositionTrades: [],
  finishedPositions: [],
};

const fill = (overrides: Partial<Fill>): Fill => ({
  side: 'buy',
  price: 100,
  quantity: 1,
  time: 60,
  symbol: 'BTC',
  contractSize: 1,
  feePercent: 0,
  ...overrides,
});

const apply = (book: PositionBook, overrides: Partial<Fill>): PositionBook => ({
  ...book,
  ...applyFill(book, fill(overrides)),
});

describe('trading engine', () => {
  it('opens and averages a position', () => {
    let book = apply(EMPTY_BOOK, { side: 'sell', price: 100, quantity: 1 });
    book = apply(book, { side: 'sell', price: 130, quantity: 2 });
    expect(book.position).toBe('short');
    expect(book.activePositionSize).toBe(3);
    expect(book.entryPrice).toBe(120);
    expect(book.positionSymbol).toBe('BTC');
  });

  it('charges fees on the notional value', () => {
    const book = apply(EMPTY_BOOK, { price: 200, quantity: 2, contractSize: 5, feePercent: 0.1 });
    expect(book.balance).toBeCloseTo(1000 - 2);
    expect(book.realizedPnL).toBeCloseTo(-2);
  });

  it('flips a position and records the closed one', () => {
    let book = apply(EMPTY_BOOK, { side: 'buy', price: 100, quantity: 2 });
    book = apply(book, { side: 'sell', price: 110, quantity: 5, time: 120 });
    expect(book.position).toBe('short');
    expect(book.activePositionSize).toBe(3);
    expect(book.entryPrice).toBe(110);
    expect(book.balance).toBe(1020);
    expect(book.finishedPositions).toHaveLength(1);
    expect(book.finishedPositions[0]).toMatchObject({
      type: 'long', entryPrice: 100, exitPrice: 110, quantity: 2, pnl: 20, openTime: 60, closeTime: 120,
    });
    expect(book.currentPositionTrades).toHaveLength(1);
  });

  it('closes everything with closeAll and ignores a flat book', () => {
    const open = apply(EMPTY_BOOK, { side: 'sell', price: 100, quantity: 2 });
    const closed = { ...open, ...closeAll(open, { price: 90, time: 120, symbol: 'BTC', contractSize: 1, feePercent: 0 }) };
    expect(closed.position).toBe('flat');
    expect(closed.balance).toBe(1020);
    expect(closeAll(EMPTY_BOOK, { price: 90, time: 0, symbol: 'BTC', contractSize: 1, feePercent: 0 })).toBeNull();
  });

  it('computes unrealized PnL net of the exit fee', () => {
    const book = apply(EMPTY_BOOK, { side: 'buy', price: 100, quantity: 2 });
    expect(unrealizedPnL(book, 110, 1, 0)).toBe(20);
    expect(unrealizedPnL(book, 110, 1, 1)).toBeCloseTo(20 - 2.2);
  });

  it('detects take-profit before stop-loss for both directions', () => {
    expect(triggeredExit('long', 111, 110, 90)).toBe(110);
    expect(triggeredExit('long', 89, 110, 90)).toBe(90);
    expect(triggeredExit('short', 89, 90, 110)).toBe(90);
    expect(triggeredExit('short', 111, 90, 110)).toBe(110);
    expect(triggeredExit('long', 100, 110, 90)).toBeNull();
    expect(triggeredExit('flat', 100, 110, 90)).toBeNull();
  });
});
