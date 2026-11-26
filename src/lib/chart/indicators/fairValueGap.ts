import type { IndicatorTemplate, KLineData } from 'klinecharts';

import type { CustomIndicatorDefinition } from '../indicatorDefinition';

const FVG_DEFAULT_PARAMS = [0] as const;
const FVG_UP_COLOR = '#22c55e';
const FVG_DOWN_COLOR = '#ef4444';
const FVG_OPACITY = 0.3;

interface Gap {
  start: number;
  end: number;
  lower: number;
  upper: number;
  bullish: boolean;
}

interface Wick {
  index: number;
  price: number;
}

// Walking backwards, keep just the successive lower wicks visible from this bar.
// Negating highs lets bearish gaps use the same first-touch search.
function recordWick(wicks: Wick[], index: number, price: number) {
  while (wicks.length && wicks[wicks.length - 1].price >= price) wicks.pop();
  wicks.push({ index, price });
}

function firstTouch(wicks: Wick[], price: number, lastBar: number): number {
  let from = 0;
  let to = wicks.length;
  while (from < to) {
    const mid = Math.floor((from + to) / 2);
    if (wicks[mid].price <= price) from = mid + 1;
    else to = mid;
  }
  return from > 0 ? wicks[from - 1].index : lastBar;
}

export function findFairValueGaps(candles: Pick<KLineData, 'high' | 'low'>[], maxBars: number): Gap[] {
  const gaps: Gap[] = [];
  const lows: Wick[] = [];
  const highs: Wick[] = [];
  const last = candles.length - 1;
  for (let i = last; i >= 2; i--) {
    const first = candles[i - 2];
    const current = candles[i];
    const bullish = current.low > first.high;
    if (bullish || current.high < first.low) {
      const lower = bullish ? first.high : current.high;
      const upper = bullish ? current.low : first.low;
      const fill = bullish ? firstTouch(lows, lower, last) : firstTouch(highs, -upper, last);
      const end = maxBars > 0 ? Math.min(fill, i + Math.floor(maxBars)) : fill;
      gaps.push({ start: i - 2, end, lower, upper, bullish });
    }
    recordWick(lows, i, current.low);
    recordWick(highs, i, -current.high);
  }
  return gaps.reverse();
}

export const FVG_INDICATOR: IndicatorTemplate<Gap> = {
  name: 'FVG',
  calcParams: [...FVG_DEFAULT_PARAMS],
  zLevel: -1,
  calc: (candles, indicator) => findFairValueGaps(candles, indicator.calcParams[0]),
  draw: ({ ctx, indicator, visibleRange, xAxis, yAxis }) => {
    const { color = FVG_UP_COLOR, opacity = FVG_OPACITY, settings } = indicator.extendData ?? {};
    ctx.globalAlpha = opacity;
    for (const gap of indicator.result) {
      if (gap.start >= visibleRange.to) break;
      if (gap.end < visibleRange.from) continue;
      const x = xAxis.convertToPixel(gap.start);
      const y = yAxis.convertToPixel(gap.upper);
      ctx.fillStyle = gap.bullish ? color : settings?.downColor ?? FVG_DOWN_COLOR;
      ctx.fillRect(x, y, xAxis.convertToPixel(gap.end) - x, yAxis.convertToPixel(gap.lower) - y);
    }
    return true;
  },
};

export const fairValueGap: CustomIndicatorDefinition = {
  template: FVG_INDICATOR,
  label: 'Fair Value Gap',
  perInstance: true,
  colorLabel: 'Up color',
  defaultColor: FVG_UP_COLOR,
  defaultOpacity: FVG_OPACITY,
  settings: [{ key: 'downColor', label: 'Down color', type: 'color', default: FVG_DOWN_COLOR, legacyTopLevel: true }],
  parameters: [{ label: 'Max extension (bars)', min: 0, integer: true }],
  parameterHelp: 'Bars after formation. Set to 0 to extend until fully filled.',
  formatParams: ([limit]) => limit > 0 ? `max ${limit} bars` : 'until filled',
};
