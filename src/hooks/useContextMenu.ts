import { useState, useCallback, useMemo } from 'react';
import type { Chart } from 'klinecharts';
import type { MenuGroup } from '../components/TradingChart/ContextMenu';
import { Target, ShieldAlert, Maximize2 } from 'lucide-react';
import React from 'react';

interface UseContextMenuProps {
  chartRef: React.RefObject<Chart | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  position: 'long' | 'short' | 'flat';
  currentPrice: number;
  setTakeProfit: (price: number | null) => void;
  setStopLoss: (price: number | null) => void;
}

export function useContextMenu({
  chartRef,
  containerRef,
  position,
  currentPrice,
  setTakeProfit,
  setStopLoss
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
    const point = result[0];
    if (point && point.value !== undefined) {
      setContextMenu({ x: e.clientX, y: e.clientY, price: point.value });
    }
  }, [chartRef, containerRef]);

  const contextMenuGroups: MenuGroup[] = useMemo(() => {
    if (!contextMenu) return [];

    const isLong = position === 'long';
    const isShort = position === 'short';
    const isFlat = position === 'flat';

    const isValidTP = isLong ? contextMenu.price > currentPrice : isShort ? contextMenu.price < currentPrice : false;
    const isValidSL = isLong ? contextMenu.price < currentPrice : isShort ? contextMenu.price > currentPrice : false;

    return [
      {
        label: 'Trading',
        items: [
          {
            label: 'Set Take Profit here',
            icon: React.createElement(Target, { size: 16 }),
            disabled: isFlat || !isValidTP,
            type: 'success',
            onClick: () => setTakeProfit(contextMenu.price)
          },
          {
            label: 'Set Stop Loss here',
            icon: React.createElement(ShieldAlert, { size: 16 }),
            disabled: isFlat || !isValidSL,
            type: 'danger',
            onClick: () => setStopLoss(contextMenu.price)
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
  }, [contextMenu, position, currentPrice, setTakeProfit, setStopLoss, chartRef]);

  return {
    contextMenu,
    setContextMenu,
    handleContextMenu,
    contextMenuGroups
  };
}
