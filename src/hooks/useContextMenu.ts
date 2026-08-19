import { useState, useCallback, useMemo } from 'react';
import type { Chart } from 'klinecharts';
import type { MenuGroup } from '../components/TradingChart/ContextMenu';
import type { ExecutionConfirmation, ExecutionPosition, OrderRequest } from '../services/execution';
import { Target, ShieldAlert, Maximize2 } from 'lucide-react';
import React from 'react';

interface UseContextMenuProps {
  chartRef: React.RefObject<Chart | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  position: 'long' | 'short' | 'flat';
  mode: 'playback' | 'simulation' | 'live';
  symbol: string;
  livePosition: ExecutionPosition | null;
  currentPrice: number;
  setTakeProfit: (price: number | null) => void;
  setStopLoss: (price: number | null) => void;
  placeOrder: (order: OrderRequest) => Promise<unknown>;
  requestConfirmation: (confirmation: ExecutionConfirmation) => void;
  askForConfirmations: boolean;
}

export function useContextMenu({
  chartRef,
  containerRef,
  position,
  mode,
  symbol,
  livePosition,
  currentPrice,
  setTakeProfit,
  setStopLoss,
  placeOrder,
  requestConfirmation,
  askForConfirmations
}: UseContextMenuProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; price: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const chart = chartRef.current;
    if (!chart) return;

    const bounding = containerRef.current?.getBoundingClientRect();
    if (!bounding) return;

    const x = e.clientX - bounding.left;
    const y = e.clientY - bounding.top;

    const result = chart.convertFromPixel([{ x, y }], { paneId: 'candle_pane' });
    const point = Array.isArray(result) ? result[0] : result;
    if (point && point.value !== undefined) {
      setContextMenu({ x: e.clientX, y: e.clientY, price: point.value });
    }
  }, [chartRef, containerRef]);

  const contextMenuGroups: MenuGroup[] = useMemo(() => {
    if (!contextMenu) return [];

    const isLong = position === 'long';
    const isShort = position === 'short';
    const isFlat = position === 'flat';
    const isLive = mode === 'live';
    const liveSide: OrderRequest['side'] | null = livePosition?.side === 'long' ? 'sell' : livePosition?.side === 'short' ? 'buy' : null;

    const isValidTP = isLong ? contextMenu.price > currentPrice : isShort ? contextMenu.price < currentPrice : false;
    const isValidSL = isLong ? contextMenu.price < currentPrice : isShort ? contextMenu.price > currentPrice : false;
    const isValidLiveTP = livePosition?.side === 'long'
      ? contextMenu.price > currentPrice
      : livePosition?.side === 'short'
        ? contextMenu.price < currentPrice
        : false;
    const isValidLiveSL = livePosition?.side === 'long'
      ? contextMenu.price < currentPrice
      : livePosition?.side === 'short'
        ? contextMenu.price > currentPrice
        : false;

    const requestLiveOrder = (order: OrderRequest, description: string) => {
      if (!askForConfirmations) {
        void placeOrder(order);
        return;
      }
      requestConfirmation({
        description,
        confirmLabel: 'Send live order',
        submit: async () => {
          await placeOrder(order);
        }
      });
    };

    const liveTakeProfit = liveSide && livePosition && symbol
      ? {
        symbol,
        side: liveSide,
        quantity: livePosition.quantity,
        orderType: 'limit' as const,
        limitPrice: contextMenu.price,
        reduceOnly: true,
      }
      : null;
    const liveStopLoss = liveSide && livePosition && symbol
      ? {
        symbol,
        side: liveSide,
        quantity: livePosition.quantity,
        orderType: 'stop' as const,
        stopPrice: contextMenu.price,
        reduceOnly: true,
      }
      : null;

    return [
      {
        label: 'Trading',
        items: [
          {
            label: isLive
              ? `Set Take Profit here (${liveSide === 'sell' ? 'Sell Limit' : 'Buy Limit'})`
              : 'Set Take Profit here',
            icon: React.createElement(Target, { size: 16 }),
            disabled: isLive ? !isValidLiveTP || !liveTakeProfit : isFlat || !isValidTP,
            type: 'success',
            onClick: () => {
              if (isLive && liveTakeProfit) {
                requestLiveOrder(
                  liveTakeProfit,
                  `Submit live ${liveTakeProfit.side.toUpperCase()} LIMIT ${liveTakeProfit.quantity} ${symbol} @ ${contextMenu.price}?`
                );
              } else if (!isLive) {
                setTakeProfit(contextMenu.price);
              }
            }
          },
          {
            label: isLive
              ? `Set Stop Loss here (${liveSide === 'sell' ? 'Sell Stop' : 'Buy Stop'})`
              : 'Set Stop Loss here',
            icon: React.createElement(ShieldAlert, { size: 16 }),
            disabled: isLive ? !isValidLiveSL || !liveStopLoss : isFlat || !isValidSL,
            type: 'danger',
            onClick: () => {
              if (isLive && liveStopLoss) {
                requestLiveOrder(
                  liveStopLoss,
                  `Submit live ${liveStopLoss.side.toUpperCase()} STOP ${liveStopLoss.quantity} ${symbol} @ ${contextMenu.price}?`
                );
              } else if (!isLive) {
                setStopLoss(contextMenu.price);
              }
            }
          }
        ]
      },
      {
        label: 'Chart',
        items: [
          {
            label: 'Reset View',
            icon: React.createElement(Maximize2, { size: 16 }),
            onClick: () => {
              chartRef.current?.resize();
              chartRef.current?.setOffsetRightDistance(50);
            }
          }
        ]
      }
    ];
  }, [contextMenu, position, mode, symbol, livePosition, currentPrice, setTakeProfit, setStopLoss, placeOrder, requestConfirmation, askForConfirmations, chartRef]);

  return {
    contextMenu,
    setContextMenu,
    handleContextMenu,
    contextMenuGroups
  };
}
