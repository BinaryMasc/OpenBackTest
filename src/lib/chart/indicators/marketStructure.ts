import type { IndicatorTemplate, KLineData } from 'klinecharts';

import type { CustomIndicatorDefinition } from '../indicatorDefinition';

const STRUCTURE_DEFAULT_PARAMS = [3] as const;

type Bar = Pick<KLineData, 'high' | 'low' | 'close'>;
type Direction = 'up' | 'down';
interface StructureBreak {
  start: number;
  end: number;
  price: number;
  label: 'ChoCh' | 'BoS';
  direction: Direction;
}

function isSwing(candles: Bar[], pivot: number, length: number, side: 'high' | 'low') {
  const price = candles[pivot][side];
  for (let offset = 1; offset <= length; offset++) {
    const left = candles[pivot - offset][side];
    const right = candles[pivot + offset][side];
    if (side === 'high' ? Math.max(left, right) >= price : Math.min(left, right) <= price) return false;
  }
  return true;
}

export function findStructureBreaks(candles: Bar[], swingLength: number): StructureBreak[] {
  const length = Math.max(1, Math.floor(swingLength) || STRUCTURE_DEFAULT_PARAMS[0]);
  const breaks: StructureBreak[] = [];
  let swingHigh: number | undefined;
  let swingLow: number | undefined;
  let trend: Direction | undefined;

  for (let i = 2 * length; i < candles.length; i++) {
    const pivot = i - length;
    if (isSwing(candles, pivot, length, 'high')) swingHigh = pivot;
    if (isSwing(candles, pivot, length, 'low')) swingLow = pivot;

    let start: number;
    let direction: Direction;
    let price: number;
    if (swingHigh !== undefined && candles[i].close > candles[swingHigh].high) {
      start = swingHigh;
      price = candles[start].high;
      direction = 'up';
      swingHigh = undefined;
    } else if (swingLow !== undefined && candles[i].close < candles[swingLow].low) {
      start = swingLow;
      price = candles[start].low;
      direction = 'down';
      swingLow = undefined;
    } else {
      continue;
    }
    const label = trend && direction !== trend ? 'ChoCh' : 'BoS';
    breaks.push({ start, end: i, price, direction, label });
    trend = direction;
  }
  return breaks;
}

export const STRUCTURE_INDICATOR: IndicatorTemplate<StructureBreak> = {
  name: 'ChoCh-BoS',
  calcParams: [...STRUCTURE_DEFAULT_PARAMS],
  calc: (candles, indicator) => findStructureBreaks(candles, indicator.calcParams[0]),
  draw: ({ ctx, indicator, visibleRange, xAxis, yAxis }) => {
    ctx.strokeStyle = indicator.styles?.lines?.[0]?.color ?? '#94a3b8';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    for (const event of indicator.result) {
      if (event.end < visibleRange.from || event.start >= visibleRange.to) continue;
      const x1 = xAxis.convertToPixel(event.start);
      const x2 = xAxis.convertToPixel(event.end);
      const y = yAxis.convertToPixel(event.price);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      if (indicator.extendData?.settings?.showLabels !== false) {
        const up = event.direction === 'up';
        ctx.textBaseline = up ? 'bottom' : 'top';
        ctx.fillText(event.label, (x1 + x2) / 2, y + (up ? -2 : 2));
      }
    }
    return true;
  },
};

export const marketStructure: CustomIndicatorDefinition = {
  template: STRUCTURE_INDICATOR,
  label: 'Change of Character / Break of Structure',
  perInstance: true,
  settings: [{ key: 'showLabels', label: 'Show ChoCh and BoS labels', type: 'checkbox', default: true, legacyTopLevel: true }],
  parameters: [{ label: 'Swing bars per side', min: 1, integer: true }],
};
