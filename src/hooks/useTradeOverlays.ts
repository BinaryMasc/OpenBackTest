import { useEffect, useRef } from 'react';
import type { Chart, OverlayEvent } from 'klinecharts';
import { useTradeStore } from '../store/useTradeStore';

export function useTradeOverlays(chartRef: React.MutableRefObject<Chart | null>) {
  const { 
    position, entryPrice, activePositionSize, unrealizedPnL, takeProfit, stopLoss, 
    tradeHistory, showTradeHistory 
  } = useTradeStore();
  const setTakeProfit = useTradeStore(state => state.setTakeProfit);
  const setStopLoss = useTradeStore(state => state.setStopLoss);

  const isDraggingRef = useRef(false);

  // Sync state to chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (position !== 'flat' && entryPrice !== null) {
      const pnlPrefix = unrealizedPnL >= 0 ? '+' : '';
      const pnlText = `${pnlPrefix}${unrealizedPnL.toFixed(2)}`;
      const positionText = `${position === 'long' ? '' : '-'} ${activePositionSize} @ ${entryPrice.toFixed(2)} | PnL: ${pnlText}`;

      const overlayData = {
        id: 'positionLine_overlay',
        name: 'positionLine',
        extendData: {
          text: positionText,
          color: position === 'long' ? '#008a63ff' : '#bb2b2bff'
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

    if (!isDraggingRef.current) {
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
  }, [chartRef, position, entryPrice, activePositionSize, unrealizedPnL, takeProfit, stopLoss, setTakeProfit, setStopLoss, tradeHistory, showTradeHistory]);
}
