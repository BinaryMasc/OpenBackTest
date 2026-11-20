import { useBacktestStore, type BacktestState } from '../store/useBacktestStore';
import { useTradeStore, type TradeState } from '../store/useTradeStore';

/**
 * Session files capture the playback position and the simulated account so a
 * backtest can be resumed later on the same data set.
 */
export function buildSession() {
  const backtest = useBacktestStore.getState();
  const trade = useTradeStore.getState();

  return {
    backtest: {
      symbol: backtest.symbol,
      currentIndex: backtest.currentIndex,
      charts: backtest.charts,
      playbackSpeed: backtest.playbackSpeed,
      mode: backtest.mode,
    },
    trade: {
      balance: trade.balance,
      realizedPnL: trade.realizedPnL,
      unrealizedPnL: trade.unrealizedPnL,
      position: trade.position,
      entryPrice: trade.entryPrice,
      activePositionSize: trade.activePositionSize,
      orderSize: trade.orderSize,
      takeProfit: trade.takeProfit,
      stopLoss: trade.stopLoss,
      leverage: trade.leverage,
      initialBalance: trade.initialBalance,
      marginBlowoutPercent: trade.marginBlowoutPercent,
      contractSize: trade.contractSize,
      feePercent: trade.feePercent,
      isBlown: trade.isBlown,
      hasTraded: trade.hasTraded,
      tradeHistory: trade.tradeHistory,
      isFinished: trade.isFinished,
      finishedPositions: trade.finishedPositions,
      currentPositionTrades: trade.currentPositionTrades,
    },
  };
}

export function downloadSession(): void {
  const blob = new Blob([JSON.stringify(buildSession(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `openbacktest_session_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Restores a session from its JSON text. Returns an error message for the
 * user, or null on success.
 */
export function importSession(json: string): string | null {
  let session: { backtest?: unknown; trade?: unknown };
  try {
    session = JSON.parse(json);
  } catch {
    return 'Failed to parse session file.';
  }
  if (!session.backtest || !session.trade) return 'Invalid session file format.';
  if (useBacktestStore.getState().rawData.length === 0) {
    return 'Please load the CSV data first before importing the session.';
  }
  useBacktestStore.getState().importState(session.backtest as Partial<BacktestState>);
  useTradeStore.getState().importState(session.trade as Partial<TradeState>);
  return null;
}
