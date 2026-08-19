import { useEffect, useRef } from 'react';
import type { Chart, OverlayEvent } from 'klinecharts';
import { useTradeStore } from '../store/useTradeStore';
import { useBacktestStore } from '../store/useBacktestStore';
import { useExecutionStore } from '../store/useExecutionStore';
import { useMarketDataStore } from '../store/useMarketDataStore';
import { useChartStyleStore } from '../store/useChartStyleStore';
import type { ExecutionPosition, OrderUpdate } from '../services/execution';
import type { MarketSymbol } from '../types';

const WORKING_ORDER_STATUSES = new Set(['pending', 'working', 'partially-filled']);

function sameSymbol(left: string, right: string): boolean {
  const normalizedLeft = left.trim().toUpperCase();
  const normalizedRight = right.trim().toUpperCase();
  return normalizedLeft === normalizedRight
    || normalizedLeft.split('.')[0] === normalizedRight.split('.')[0];
}

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

export function useTradeOverlays(
  chartRef: React.MutableRefObject<Chart | null>,
  chartReady = true
) {
  const { 
    position, entryPrice, activePositionSize, unrealizedPnL, takeProfit, stopLoss, 
    tradeHistory, showTradeHistory, contractSize
  } = useTradeStore();
  const mode = useBacktestStore(state => state.mode);
  const currentSymbol = useBacktestStore(state => state.symbol);
  const currentPrice = useBacktestStore(state => state.rawData[state.currentIndex]?.close);
  const accountState = useExecutionStore(state => state.accountState);
  const marketSymbols = useMarketDataStore(state => state.symbols);
  const cancelOrder = useExecutionStore(state => state.cancelOrder);
  const placeOrder = useExecutionStore(state => state.placeOrder);
  const setTakeProfit = useTradeStore(state => state.setTakeProfit);
  const setStopLoss = useTradeStore(state => state.setStopLoss);
  const upColor = useChartStyleStore(state => state.upColor);
  const downColor = useChartStyleStore(state => state.downColor);

  const isDraggingRef = useRef(false);

  // Sync state to chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    if (mode !== 'live' && position !== 'flat' && entryPrice !== null) {
      const pnlPrefix = unrealizedPnL >= 0 ? '+' : '';
      const pnlText = `${pnlPrefix}${unrealizedPnL.toFixed(2)}`;
      const positionText = `${position === 'long' ? '' : '-'} ${activePositionSize} @ ${entryPrice.toFixed(2)} | PnL: ${pnlText}`;

      const overlayData = {
        id: 'positionLine_overlay',
        name: 'positionLine',
        extendData: {
          text: positionText,
          color: position === 'long' ? upColor : downColor
        },
        points: [{ value: entryPrice }]
      };

      if (chart.getOverlayById('positionLine_overlay')) {
        chart.overrideOverlay(overlayData);
      } else {
        chart.createOverlay(overlayData);
      }
    } else {
      chart.removeOverlay({ id: 'positionLine_overlay' });
    }

    const calcPnL = (val: number) => {
      if (position === 'long') return (val - entryPrice!) * activePositionSize;
      if (position === 'short') return (entryPrice! - val) * activePositionSize;
      return 0;
    };

    const handleDrag = (event: OverlayEvent, type: string) => {
      const val = event.overlay.points[0]?.value;
      if (val === undefined) return false;
      const pnl = calcPnL(val);
      const pnlStr = pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2);

      // Override overlay data without breaking drag
      // by not passing 'points' so we don't overwrite current drag state.
      chart.overrideOverlay({
        id: event.overlay.id,
        extendData: `${type}: ${val.toFixed(2)} (${pnlStr})`
      });
      return false; // return false to not prevent default dragging
    };

    if (mode !== 'live' && !isDraggingRef.current) {
      if (takeProfit !== null) {
        const tpPnl = calcPnL(takeProfit);
        const tpPnlStr = tpPnl >= 0 ? `+${tpPnl.toFixed(2)}` : tpPnl.toFixed(2);
        const tpData = {
          id: 'tpLine_overlay',
          name: 'tpLine',
          extendData: `TP: ${takeProfit.toFixed(2)} (${tpPnlStr})`,
          points: [{ value: takeProfit }],
          onPressedMoving: (event: OverlayEvent) => {
            isDraggingRef.current = true;
            handleDrag(event, 'TP');
            return false;
          },
          onPressedMoveEnd: (event: OverlayEvent) => {
            isDraggingRef.current = false;
            const val = event.overlay.points[0]?.value;
            if (val !== undefined) setTakeProfit(val);
            return false;
          }
        };

        if (chart.getOverlayById('tpLine_overlay')) {
          chart.overrideOverlay(tpData);
        } else {
          chart.createOverlay(tpData);
        }
      } else {
        chart.removeOverlay({ id: 'tpLine_overlay' });
      }

      if (stopLoss !== null) {
        const slPnl = calcPnL(stopLoss);
        const slPnlStr = slPnl >= 0 ? `+${slPnl.toFixed(2)}` : slPnl.toFixed(2);
        const slData = {
          id: 'slLine_overlay',
          name: 'slLine',
          extendData: `SL: ${stopLoss.toFixed(2)} (${slPnlStr})`,
          points: [{ value: stopLoss }],
          onPressedMoving: (event: OverlayEvent) => {
            isDraggingRef.current = true;
            handleDrag(event, 'SL');
            return false;
          },
          onPressedMoveEnd: (event: OverlayEvent) => {
            isDraggingRef.current = false;
            const val = event.overlay.points[0]?.value;
            if (val !== undefined) setStopLoss(val);
            return false;
          }
        };

        if (chart.getOverlayById('slLine_overlay')) {
          chart.overrideOverlay(slData);
        } else {
          chart.createOverlay(slData);
        }
      } else {
        chart.removeOverlay({ id: 'slLine_overlay' });
      }
    } else if (mode === 'live') {
      chart.removeOverlay({ id: 'tpLine_overlay' });
      chart.removeOverlay({ id: 'slLine_overlay' });
    }

    // Live-mode orders and positions come from the broker account state,
    // not from the simulation trade store. Keep them in their own group so
    // every streamed order update redraws the chart without touching drawings.
    chart.removeOverlay({ groupId: 'broker_trade_group' });
    if (mode === 'live' && accountState && currentSymbol) {
      const contractMultiplier = getLiveContractMultiplier(marketSymbols, currentSymbol, contractSize);
      const livePosition = accountState.positions.find(item =>
        sameSymbol(item.symbol, currentSymbol)
        && item.side !== 'flat'
        && item.quantity > 0
      );

      accountState.positions
        .filter(item => sameSymbol(item.symbol, currentSymbol)
          && item.side !== 'flat'
          && isPositiveFinite(item.averagePrice)
          && item.quantity > 0)
        .forEach(item => {
          const averagePrice = item.averagePrice;
          if (!isPositiveFinite(averagePrice)) return;
          const side = item.side === 'short' ? 'SHORT' : 'LONG';
          const color = item.side === 'short' ? downColor : upColor;
          const pnl = calculateLivePnL(item, currentPrice, contractMultiplier);
          chart.createOverlay({
            id: `broker_position_${item.symbol}`,
            name: 'positionLine',
            groupId: 'broker_trade_group',
            extendData: {
              text: `${side} ${item.quantity} @ ${formatPrice(averagePrice)} | PnL: ${formatPnL(pnl)}`,
              color,
              dashed: false,
            },
            points: [{ value: averagePrice }],
          });
        });

      accountState.orders
        .filter(item => sameSymbol(item.symbol, currentSymbol)
          && WORKING_ORDER_STATUSES.has(item.status)
          && (item.orderType === 'limit' || item.orderType === 'stop' || item.orderType === 'stop-limit')
          && Number.isFinite(item.orderType === 'limit' ? item.limitPrice : item.stopPrice))
        .forEach(item => {
          const price = item.orderType === 'limit' ? item.limitPrice : item.stopPrice;
          if (!isPositiveFinite(price)) return;

          const side = item.side.toUpperCase();
          const status = item.status.replace('-', ' ').toUpperCase();
          const orderLabel = item.orderType === 'limit'
            ? 'LIMIT'
            : item.orderType === 'stop-limit'
              ? 'STOP LIMIT'
              : 'STOP';
          const protectiveLabel = getProtectiveOrderLabel(item, livePosition);
          const displayLabel = protectiveLabel ?? orderLabel;
          const overlayName = protectiveLabel === 'TP'
            ? 'tpLine'
            : protectiveLabel === 'SL'
              ? 'slLine'
              : 'brokerLine';
          const color = item.side === 'buy' ? upColor : downColor;
          const overlayId = `broker_order_${item.orderId}`;
          const remainingQuantity = Math.max(0, item.quantity - item.filledQuantity);
          const formatOrderText = (value: number, dragged = false) => {
            if (protectiveLabel && livePosition) {
              const pnl = calculateLivePnL(livePosition, value, contractMultiplier, remainingQuantity);
              return `${protectiveLabel}: ${formatPrice(value)} (${formatPnL(pnl)})`;
            }
            return `${displayLabel} ${side} ${item.quantity} @ ${formatPrice(value)} | ${dragged ? 'DRAGGED' : status}`;
          };
          const extendData = overlayName === 'brokerLine'
            ? { text: formatOrderText(price), color, dashed: true }
            : formatOrderText(price);

          chart.createOverlay({
            id: overlayId,
            name: overlayName,
            groupId: 'broker_trade_group',
            extendData,
            points: [{ value: price }],
            onPressedMoving: (event: OverlayEvent) => {
              const value = event.overlay.points[0]?.value;
              if (!isPositiveFinite(value)) return false;
              chart.overrideOverlay({
                id: overlayId,
                extendData: overlayName === 'brokerLine'
                  ? { text: formatOrderText(value, true), color, dashed: true }
                  : formatOrderText(value),
              });
              return false;
            },
            onPressedMoveEnd: (event: OverlayEvent) => {
              const value = event.overlay.points[0]?.value;
              const originalPrice = item.orderType === 'limit' ? item.limitPrice : item.stopPrice;
              if (!isPositiveFinite(value) || value === originalPrice) return false;

              if (remainingQuantity > 0) {
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
              }
              return false;
            },
          });
        });
    }

    // Sync trade history
    chart.removeOverlay({ groupId: 'trade_history_group' });
    if (showTradeHistory && tradeHistory.length > 0) {
      tradeHistory.forEach(trade => {
        chart.createOverlay({
          id: `trade_${trade.id}`,
          name: 'tradeArrow',
          groupId: 'trade_history_group',
          extendData: trade.type,
          points: [{ timestamp: trade.time * 1000, value: trade.price }]
        });
      });
    }
  }, [chartRef, chartReady, mode, currentSymbol, currentPrice, accountState, marketSymbols, contractSize, cancelOrder, placeOrder, position, entryPrice, activePositionSize, unrealizedPnL, takeProfit, stopLoss, setTakeProfit, setStopLoss, tradeHistory, showTradeHistory, upColor, downColor]);
}
