import { useEffect, useMemo, useRef } from 'react';
import type { Chart, OverlayCreate, OverlayEvent } from 'klinecharts';
import { useTradeStore } from '../store/useTradeStore';
import { useBacktestStore } from '../store/useBacktestStore';
import { useExecutionStore } from '../store/useExecutionStore';
import { useMarketDataStore } from '../store/useMarketDataStore';
import { useChartStyleStore } from '../store/useChartStyleStore';
import type { ExecutionPosition, OrderUpdate } from '../services/execution';
import type { MarketSymbol } from '../types';
import { sameSymbol } from '../lib/symbols';
import { pnlPerUnit } from '../lib/trading/engine';
import {
  EMPTY_STORED_TRADE_ARROWS,
  getSymbolKey,
  useChartStateStore,
  type StoredTradeArrow,
  type StoredTradeMode
} from '../store/useChartStateStore';

const WORKING_ORDER_STATUSES = new Set(['pending', 'working', 'partially-filled']);

function formatPrice(price: number): string {
  return price.toFixed(price >= 1000 ? 2 : 4).replace(/\.?0+$/, '');
}

function isPositiveFinite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function getLiveContractMultiplier(
  symbols: MarketSymbol[],
  currentSymbol: string,
  fallbackContractSize: number
): number {
  const instrument = symbols.find(item => sameSymbol(item.symbol, currentSymbol));
  return [instrument?.contractSize, instrument?.pointValue, fallbackContractSize]
    .find(isPositiveFinite) ?? 1;
}

function calculateLivePnL(
  position: ExecutionPosition,
  price: number | undefined,
  contractMultiplier: number,
  quantity = position.quantity
): number | null {
  const averagePrice = position.averagePrice;
  if (
    !isPositiveFinite(averagePrice)
    || !isPositiveFinite(price)
    || !isPositiveFinite(quantity)
    || !isPositiveFinite(contractMultiplier)
    || position.side === 'flat'
  ) {
    return null;
  }

  const priceDifference = position.side === 'long'
    ? price - averagePrice
    : averagePrice - price;
  return priceDifference * quantity * contractMultiplier;
}

function formatPnL(value: number | null): string {
  if (value === null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function getProtectiveOrderLabel(order: OrderUpdate, position: ExecutionPosition | undefined): 'TP' | 'SL' | null {
  if (!position || position.side === 'flat') return null;

  const closesLong = position.side === 'long' && order.side === 'sell';
  const closesShort = position.side === 'short' && order.side === 'buy';
  if (!closesLong && !closesShort) return null;

  if (order.orderType === 'limit') return 'TP';
  if (order.orderType === 'stop' || order.orderType === 'stop-limit') return 'SL';
  return null;
}

/**
 * KlineCharts resolves a timestamp to the nearest candle. That can move a
 * trade marker to an adjacent candle when the chart is aggregated or when a
 * trade occurs between two candle timestamps. Use the candle containing the
 * trade instead: the last chart candle whose start is at or before the trade.
 */
export function findContainingCandleIndex(
  dataList: Array<{ timestamp?: number }>,
  tradeTimestamp: number
): number {
  if (dataList.length === 0) return 0;

  let low = 0;
  let high = dataList.length - 1;
  if ((dataList[0].timestamp ?? 0) >= tradeTimestamp) return 0;
  if ((dataList[high].timestamp ?? 0) <= tradeTimestamp) return high;

  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    const middleTimestamp = dataList[middle].timestamp ?? 0;
    if (middleTimestamp <= tradeTimestamp) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return low;
}

const POSITION_LINE_ID = 'positionLine_overlay';
const TP_LINE_ID = 'tpLine_overlay';
const SL_LINE_ID = 'slLine_overlay';
const BROKER_GROUP_ID = 'broker_trade_group';
const TRADE_HISTORY_GROUP_ID = 'trade_history_group';

function signed(value: number): string {
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function upsertOverlay(chart: Chart, overlay: OverlayCreate & { id: string }): void {
  if (chart.getOverlayById(overlay.id)) {
    chart.overrideOverlay(overlay);
  } else {
    chart.createOverlay(overlay);
  }
}

/**
 * Draws trading state on a chart: the simulated position with draggable
 * TP/SL lines, live broker positions and working orders, and trade arrows.
 *
 * `dataLayout` should change whenever the chart's bars are replaced (data
 * set or timeframe switch) so arrows are re-anchored to the new candles.
 */
export function useTradeOverlays(
  chartRef: React.MutableRefObject<Chart | null>,
  chartReady = true,
  dataLayout?: unknown,
) {
  const position = useTradeStore(state => state.position);
  const entryPrice = useTradeStore(state => state.entryPrice);
  const activePositionSize = useTradeStore(state => state.activePositionSize);
  const unrealizedPnL = useTradeStore(state => state.unrealizedPnL);
  const takeProfit = useTradeStore(state => state.takeProfit);
  const stopLoss = useTradeStore(state => state.stopLoss);
  const tradeHistory = useTradeStore(state => state.tradeHistory);
  const showTradeHistory = useTradeStore(state => state.showTradeHistory);
  const contractSize = useTradeStore(state => state.contractSize);
  const setTakeProfit = useTradeStore(state => state.setTakeProfit);
  const setStopLoss = useTradeStore(state => state.setStopLoss);
  const mode = useBacktestStore(state => state.mode);
  const currentSymbol = useBacktestStore(state => state.symbol);
  const currentPrice = useBacktestStore(state => state.rawData[state.currentIndex]?.close);
  const currentTime = useBacktestStore(state => state.rawData[state.currentIndex]?.time);
  const accountState = useExecutionStore(state => state.accountState);
  const liveFills = useExecutionStore(state => state.fills);
  const marketSymbols = useMarketDataStore(state => state.symbols);
  const cancelOrder = useExecutionStore(state => state.cancelOrder);
  const placeOrder = useExecutionStore(state => state.placeOrder);
  const upColor = useChartStyleStore(state => state.upColor);
  const downColor = useChartStyleStore(state => state.downColor);

  const isLive = mode === 'live';
  const storedTradeMode: StoredTradeMode = isLive ? 'live' : 'simulation';
  const tradePersistenceKey = `${storedTradeMode}:${getSymbolKey(currentSymbol)}`;
  const currentTradeArrows = useMemo<StoredTradeArrow[]>(() => {
    if (isLive) {
      return liveFills
        .filter(fill => sameSymbol(fill.symbol, currentSymbol))
        .map((fill, index) => ({
          id: `${fill.orderId}_${fill.time}_${index}`,
          side: fill.side,
          price: fill.price,
          time: fill.time,
        }));
    }

    return tradeHistory.map(trade => ({
      id: trade.id,
      side: trade.type,
      price: trade.price,
      time: trade.time,
    }));
  }, [currentSymbol, liveFills, isLive, tradeHistory]);
  // Read the persisted arrows during each render so a reset/clear action is
  // reflected without maintaining a second piece of React state. The store
  // returns stable array references until that symbol/mode changes.
  const storedTradeArrows = currentSymbol
    ? useChartStateStore.getState().bySymbol[getSymbolKey(currentSymbol)]?.trades?.[storedTradeMode]
      ?? EMPTY_STORED_TRADE_ARROWS
    : EMPTY_STORED_TRADE_ARROWS;
  const previousTradePersistenceKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentSymbol) return;
    if (
      previousTradePersistenceKeyRef.current !== null
      && previousTradePersistenceKeyRef.current !== tradePersistenceKey
    ) {
      // A symbol or mode switch must not save the previous source under the
      // new key before the new source has produced a trade.
      previousTradePersistenceKeyRef.current = tradePersistenceKey;
      return;
    }
    previousTradePersistenceKeyRef.current = tradePersistenceKey;
    if (currentTradeArrows.length > 0) {
      useChartStateStore.getState().saveTrades(currentSymbol, storedTradeMode, currentTradeArrows);
    }
  }, [currentSymbol, currentTradeArrows, storedTradeMode, tradePersistenceKey]);

  const isDraggingRef = useRef(false);

  // Simulated position line with draggable take-profit / stop-loss lines.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    if (!isLive && position !== 'flat' && entryPrice !== null) {
      const positionText = `${position === 'long' ? '' : '-'} ${activePositionSize} @ ${entryPrice.toFixed(2)} | PnL: ${signed(unrealizedPnL)}`;
      upsertOverlay(chart, {
        id: POSITION_LINE_ID,
        name: 'positionLine',
        extendData: { text: positionText, color: position === 'long' ? upColor : downColor },
        points: [{ value: entryPrice }],
      });
    } else {
      chart.removeOverlay({ id: POSITION_LINE_ID });
    }

    if (isLive) {
      chart.removeOverlay({ id: TP_LINE_ID });
      chart.removeOverlay({ id: SL_LINE_ID });
      return;
    }
    // Rewriting the line mid-drag would snap it back to the stored price.
    if (isDraggingRef.current) return;

    const pnlAt = (price: number) => {
      if (position === 'flat' || entryPrice === null) return 0;
      return pnlPerUnit(position, entryPrice, price) * activePositionSize;
    };
    const label = (kind: 'TP' | 'SL', price: number) => `${kind}: ${price.toFixed(2)} (${signed(pnlAt(price))})`;

    const syncExitLine = (kind: 'TP' | 'SL', price: number | null, commit: (value: number) => void) => {
      const id = kind === 'TP' ? TP_LINE_ID : SL_LINE_ID;
      if (price === null) {
        chart.removeOverlay({ id });
        return;
      }
      upsertOverlay(chart, {
        id,
        name: kind === 'TP' ? 'tpLine' : 'slLine',
        extendData: label(kind, price),
        points: [{ value: price }],
        onPressedMoving: (event: OverlayEvent) => {
          isDraggingRef.current = true;
          const value = event.overlay.points[0]?.value;
          // Only update the label: passing points would fight the drag.
          if (value !== undefined) chart.overrideOverlay({ id: event.overlay.id, extendData: label(kind, value) });
          return false;
        },
        onPressedMoveEnd: (event: OverlayEvent) => {
          isDraggingRef.current = false;
          const value = event.overlay.points[0]?.value;
          if (value !== undefined) commit(value);
          return false;
        },
      });
    };

    syncExitLine('TP', takeProfit, setTakeProfit);
    syncExitLine('SL', stopLoss, setStopLoss);
  }, [chartRef, chartReady, isLive, position, entryPrice, activePositionSize, unrealizedPnL, takeProfit, stopLoss, setTakeProfit, setStopLoss, upColor, downColor]);

  // Live-mode orders and positions come from the broker account state, not
  // from the simulation trade store. Keep them in their own group so every
  // streamed update redraws them without touching user drawings.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    chart.removeOverlay({ groupId: BROKER_GROUP_ID });
    if (!isLive || !accountState || !currentSymbol) return;

    const contractMultiplier = getLiveContractMultiplier(marketSymbols, currentSymbol, contractSize);
    const openPositions = accountState.positions.filter(item =>
      sameSymbol(item.symbol, currentSymbol) && item.side !== 'flat' && item.quantity > 0,
    );
    const livePosition = openPositions[0];

    openPositions.forEach(item => {
      const averagePrice = item.averagePrice;
      if (!isPositiveFinite(averagePrice)) return;
      const side = item.side === 'short' ? 'SHORT' : 'LONG';
      const pnl = calculateLivePnL(item, currentPrice, contractMultiplier);
      chart.createOverlay({
        id: `broker_position_${item.symbol}`,
        name: 'positionLine',
        groupId: BROKER_GROUP_ID,
        extendData: {
          text: `${side} ${item.quantity} @ ${formatPrice(averagePrice)} | PnL: ${formatPnL(pnl)}`,
          color: item.side === 'short' ? downColor : upColor,
          dashed: false,
        },
        points: [{ value: averagePrice }],
      });
    });

    accountState.orders
      .filter(item => sameSymbol(item.symbol, currentSymbol)
        && WORKING_ORDER_STATUSES.has(item.status)
        && (item.orderType === 'limit' || item.orderType === 'stop' || item.orderType === 'stop-limit'))
      .forEach(item => {
        const originalPrice = item.orderType === 'limit' ? item.limitPrice : item.stopPrice;
        if (!isPositiveFinite(originalPrice)) return;

        const side = item.side.toUpperCase();
        const status = item.status.replace('-', ' ').toUpperCase();
        const orderLabel = item.orderType === 'limit'
          ? 'LIMIT'
          : item.orderType === 'stop-limit'
            ? 'STOP LIMIT'
            : 'STOP';
        const protectiveLabel = getProtectiveOrderLabel(item, livePosition);
        const overlayName = protectiveLabel === 'TP'
          ? 'tpLine'
          : protectiveLabel === 'SL'
            ? 'slLine'
            : 'brokerLine';
        const color = item.side === 'buy' ? upColor : downColor;
        const overlayId = `broker_order_${item.orderId}`;
        const remainingQuantity = Math.max(0, item.quantity - item.filledQuantity);
        const orderText = (value: number, dragged = false) => {
          if (protectiveLabel && livePosition) {
            const pnl = calculateLivePnL(livePosition, value, contractMultiplier, remainingQuantity);
            return `${protectiveLabel}: ${formatPrice(value)} (${formatPnL(pnl)})`;
          }
          return `${protectiveLabel ?? orderLabel} ${side} ${item.quantity} @ ${formatPrice(value)} | ${dragged ? 'DRAGGED' : status}`;
        };
        const extendDataAt = (value: number, dragged = false) => overlayName === 'brokerLine'
          ? { text: orderText(value, dragged), color, dashed: true }
          : orderText(value);

        chart.createOverlay({
          id: overlayId,
          name: overlayName,
          groupId: BROKER_GROUP_ID,
          extendData: extendDataAt(originalPrice),
          points: [{ value: originalPrice }],
          onPressedMoving: (event: OverlayEvent) => {
            const value = event.overlay.points[0]?.value;
            if (isPositiveFinite(value)) chart.overrideOverlay({ id: overlayId, extendData: extendDataAt(value, true) });
            return false;
          },
          onPressedMoveEnd: (event: OverlayEvent) => {
            const value = event.overlay.points[0]?.value;
            if (!isPositiveFinite(value) || value === originalPrice || remainingQuantity <= 0) return false;

            // Brokers cannot move an order in place: cancel and resubmit.
            void (async () => {
              const cancelled = await cancelOrder(item.orderId);
              if (!cancelled) return;
              await placeOrder({
                symbol: item.symbol,
                side: item.side,
                quantity: remainingQuantity,
                orderType: item.orderType,
                reduceOnly: item.reduceOnly,
                ...(item.orderType === 'limit' ? { limitPrice: value } : item.orderType === 'stop-limit' ? { limitPrice: item.limitPrice } : {}),
                ...(item.orderType === 'stop' || item.orderType === 'stop-limit' ? { stopPrice: value } : {}),
                clientOrderId: `${item.clientOrderId || item.orderId}-move-${Date.now()}`,
              });
            })();
            return false;
          },
        });
      });
  }, [chartRef, chartReady, isLive, currentSymbol, currentPrice, accountState, marketSymbols, contractSize, cancelOrder, placeOrder, upColor, downColor]);

  // Trade arrows. Trades after the playback cursor (e.g. after seeking back)
  // are hidden until playback reaches them again.
  const history = currentTradeArrows.length > 0 ? currentTradeArrows : storedTradeArrows;
  const visibleArrowCount = currentTime === undefined
    ? history.length
    : history.filter(trade => trade.time <= currentTime).length;

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    chart.removeOverlay({ groupId: TRADE_HISTORY_GROUP_ID });
    if (!showTradeHistory || visibleArrowCount === 0) return;

    const dataList = typeof chart.getDataList === 'function' ? chart.getDataList() : [];
    const visible = currentTime === undefined ? history : history.filter(trade => trade.time <= currentTime);
    visible.forEach((trade, index) => {
      const tradeTimestamp = trade.time * 1000;
      chart.createOverlay({
        id: `trade_${trade.id || `${trade.time}_${index}`}`,
        name: 'tradeArrow',
        groupId: TRADE_HISTORY_GROUP_ID,
        extendData: { type: trade.side, color: '#ffffff' },
        points: [dataList.length > 0
          ? { dataIndex: findContainingCandleIndex(dataList, tradeTimestamp), value: trade.price }
          : { timestamp: tradeTimestamp, value: trade.price }],
      });
    });
    // currentTime is read only to filter; visibleArrowCount tracks its effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartRef, chartReady, history, showTradeHistory, visibleArrowCount, dataLayout]);
}
