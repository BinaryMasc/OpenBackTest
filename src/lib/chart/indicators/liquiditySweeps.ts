import type { IndicatorTemplate, KLineData } from 'klinecharts';
import type { CustomIndicatorDefinition } from '../indicatorDefinition';
import { isSwing } from './swings';

interface Sweep {
  pivot: number;
  end: number;
  level: number;
  bullish: boolean;
}

export function findLiquiditySweeps(bars: Pick<KLineData, 'high' | 'low' | 'close'>[], length: number): Sweep[] {
  const events: Sweep[] = [];
  let high: number | undefined;
  let low: number | undefined;
  for (let i = length * 2; i < bars.length; i++) {
    const bar = bars[i];
    // The first penetration consumes the level, including a close-through break.
    if (high !== undefined && bar.high > bars[high].high) {
      if (bar.close < bars[high].high) events.push({ pivot: high, end: i, level: bars[high].high, bullish: false });
      high = undefined;
    }
    if (low !== undefined && bar.low < bars[low].low) {
      if (bar.close > bars[low].low) events.push({ pivot: low, end: i, level: bars[low].low, bullish: true });
      low = undefined;
    }
    const pivot = i - length;
    if (isSwing(bars, pivot, length, 'high')) high = pivot;
    if (isSwing(bars, pivot, length, 'low')) low = pivot;
  }
  return events;
}

const template: IndicatorTemplate<Sweep> = {
  name: 'Sweeps',
  calcParams: [3],
  calc: (bars, indicator) => findLiquiditySweeps(bars, Math.max(1, Math.floor(indicator.calcParams[0]) || 3)),
  draw: ({ ctx, indicator, xAxis, yAxis, visibleRange }) => {
    const { color, opacity, settings } = indicator.extendData;
    ctx.globalAlpha = opacity;
    ctx.setLineDash([3, 3]);
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (const sweep of indicator.result) {
      if (sweep.end < visibleRange.from || sweep.pivot >= visibleRange.to) continue;
      const x = xAxis.convertToPixel(sweep.end);
      const y = yAxis.convertToPixel(sweep.level);
      ctx.fillStyle = ctx.strokeStyle = sweep.bullish ? color : settings.downColor;
      ctx.beginPath();
      ctx.moveTo(xAxis.convertToPixel(sweep.pivot), y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.textBaseline = sweep.bullish ? 'top' : 'bottom';
      ctx.fillText('Sweep', x, y + (sweep.bullish ? 2 : -2));
    }
    return true;
  },
};

export const liquiditySweeps: CustomIndicatorDefinition = {
  template, label: 'Liquidity Sweeps', perInstance: true,
  colorLabel: 'Bullish sweep', defaultColor: '#34d399',
  settings: [{ key: 'downColor', type: 'color', label: 'Bearish sweep', default: '#f87171' }],
  parameters: [{ label: 'Swing bars per side', min: 1, integer: true }],
};
