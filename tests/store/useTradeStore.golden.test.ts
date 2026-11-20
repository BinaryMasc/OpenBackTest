import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBacktestStore } from '../../src/store/useBacktestStore';
import { useTradeStore } from '../../src/store/useTradeStore';

/**
 * Golden-master test for the simulation trade engine. It replays a scripted
 * sequence covering every netting branch (open, average, partial close, full
 * close, flip, flatten, TP/SL) on both sides with fees enabled, and compares
 * the full resulting account state with a recorded snapshot.
 */

type Step =
  | ['buy' | 'sell' | 'flat', number, number?]
  | ['tick', number]
  | ['tp' | 'sl', number | null];

const SCRIPT: Step[] = [
  ['buy', 100, 2],      // open long
  ['buy', 104, 1],      // average long
  ['sell', 110, 1],     // partial close long
  ['sell', 108, 2],     // full close long
  ['sell', 108, 3],     // open short
  ['sell', 112, 1],     // average short
  ['buy', 105, 2],      // partial close short
  ['buy', 101, 5],      // flip short -> long (close 2, open 3)
  ['tick', 103],        // unrealized PnL
  ['sell', 99, 7],      // flip long -> short (close 3, open 4)
  ['tp', 95],
  ['sl', 104],
  ['tick', 98],         // no trigger
  ['tick', 94],         // take profit hit
  ['buy', 90, 1],       // open long
  ['sl', 85],
  ['tick', 84],         // stop loss hit
  ['sell', 80, 1],      // open short
  ['flat', 82],         // flatten
];

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'id')
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  if (typeof value === 'number') return Number(value.toFixed(8));
  return value;
}

function snapshotState() {
  const state = useTradeStore.getState();
  return normalize({
    balance: state.balance,
    realizedPnL: state.realizedPnL,
    unrealizedPnL: state.unrealizedPnL,
    position: state.position,
    positionSymbol: state.positionSymbol,
    entryPrice: state.entryPrice,
    activePositionSize: state.activePositionSize,
    takeProfit: state.takeProfit,
    stopLoss: state.stopLoss,
    hasTraded: state.hasTraded,
    tradeHistory: state.tradeHistory,
    currentPositionTrades: state.currentPositionTrades,
    finishedPositions: state.finishedPositions,
  });
}

describe('trade engine golden master', () => {
  beforeEach(() => {
    useBacktestStore.setState({ rawData: [], symbol: 'BTCUSDT', currentIndex: -1, isPlaying: false });
    useTradeStore.getState().setInitialBalance(10000);
    useTradeStore.getState().reset();
    useTradeStore.getState().setFeePercent(0.05);
    useTradeStore.getState().setContractSize(2);
    useTradeStore.getState().setLeverage(150);
  });
  afterEach(() => vi.restoreAllMocks());

  it('replays every netting branch with fees and matches the recorded state', () => {
    let tick = 1000;
    const timeSpy = vi.spyOn(useBacktestStore.getState(), 'getCurrentTickTime');
    const states: unknown[] = [];

    for (const step of SCRIPT) {
      tick += 60;
      timeSpy.mockReturnValue(tick);
      const store = useTradeStore.getState();
      const [action, value, size] = step;
      if (action === 'buy' || action === 'sell') {
        store.setOrderSize(size ?? 1);
        store[action](value as number);
      } else if (action === 'flat') {
        store.flat(value as number);
      } else if (action === 'tick') {
        store.updateUnrealizedPnL(value as number);
      } else if (action === 'tp') {
        store.setTakeProfit(value);
      } else {
        store.setStopLoss(value);
      }
      states.push(snapshotState());
    }

    expect(states).toMatchSnapshot();
  });
});
