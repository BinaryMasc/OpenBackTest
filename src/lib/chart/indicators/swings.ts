import type { KLineData } from 'klinecharts';

export function isSwing(candles: Pick<KLineData, 'high' | 'low'>[], pivot: number, length: number, side: 'high' | 'low') {
  const price = candles[pivot][side];
  for (let offset = 1; offset <= length; offset++) {
    const left = candles[pivot - offset][side];
    const right = candles[pivot + offset][side];
    if (side === 'high' ? Math.max(left, right) >= price : Math.min(left, right) <= price) return false;
  }
  return true;
}
