import type { IndicatorDrawParams, IndicatorSeries, IndicatorTemplate } from 'klinecharts';

export const VPVR_DEFAULT_PARAMS = [120, 30, 70] as const;

type VpvrDrawParams = IndicatorDrawParams<Record<string, never>>;

export const VPVR_INDICATOR: IndicatorTemplate<Record<string, never>> = {
  name: 'VPVR',
  shortName: 'VPVR',
  series: 'normal' as IndicatorSeries,
  calcParams: [...VPVR_DEFAULT_PARAMS],
  shouldOhlc: false,
  calc: dataList => dataList.map(() => ({})),
  draw: ({ ctx, kLineDataList, visibleRange, bounding, yAxis, indicator }: VpvrDrawParams) => {
    if (visibleRange.from >= visibleRange.to) return false;
    const rowCount = Math.max(1, Math.floor(Number(indicator.calcParams[0]) || VPVR_DEFAULT_PARAMS[0]));
    const widthPercent = Math.max(1, Math.min(100, Number(indicator.calcParams[1]) || VPVR_DEFAULT_PARAMS[1]));
    const valueAreaPercent = Math.max(1, Math.min(100, Number(indicator.calcParams[2]) || VPVR_DEFAULT_PARAMS[2]));
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (let index = visibleRange.from; index < visibleRange.to; index += 1) {
      const candle = kLineDataList[index];
      if (!candle) continue;
      minPrice = Math.min(minPrice, candle.low);
      maxPrice = Math.max(maxPrice, candle.high);
    }
    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice <= minPrice) return false;

    const rowHeight = (maxPrice - minPrice) / rowCount;
    const rows = new Array<number>(rowCount).fill(0);
    for (let index = visibleRange.from; index < visibleRange.to; index += 1) {
      const candle = kLineDataList[index];
      const volume = Number(candle?.volume) || 0;
      if (!candle || volume <= 0) continue;
      if (candle.high <= candle.low) {
        const row = Math.max(0, Math.min(rowCount - 1, Math.floor((candle.close - minPrice) / rowHeight)));
        rows[row] += volume;
        continue;
      }
      const volumePerPrice = volume / (candle.high - candle.low);
      const firstRow = Math.max(0, Math.floor((candle.low - minPrice) / rowHeight));
      const lastRow = Math.min(rowCount - 1, Math.floor((candle.high - minPrice) / rowHeight));
      for (let row = firstRow; row <= lastRow; row += 1) {
        const rowLow = minPrice + row * rowHeight;
        const rowHigh = rowLow + rowHeight;
        const overlap = Math.min(candle.high, rowHigh) - Math.max(candle.low, rowLow);
        if (overlap > 0) rows[row] += volumePerPrice * overlap;
      }
    }

    const maxVolume = Math.max(...rows);
    const totalVolume = rows.reduce((sum, volume) => sum + volume, 0);
    if (maxVolume <= 0 || totalVolume <= 0) return false;
    const pocIndex = rows.indexOf(maxVolume);
    const inValueArea = new Array<boolean>(rowCount).fill(false);
    inValueArea[pocIndex] = true;
    let valueAreaVolume = rows[pocIndex];
    let upper = pocIndex + 1;
    let lower = pocIndex - 1;
    const targetVolume = totalVolume * (valueAreaPercent / 100);
    while (valueAreaVolume < targetVolume && (upper < rowCount || lower >= 0)) {
      const upperVolume = upper < rowCount ? rows[upper] : -1;
      const lowerVolume = lower >= 0 ? rows[lower] : -1;
      if (upperVolume >= lowerVolume) {
        valueAreaVolume += upperVolume;
        inValueArea[upper] = true;
        upper += 1;
      } else {
        valueAreaVolume += lowerVolume;
        inValueArea[lower] = true;
        lower -= 1;
      }
    }
    const maxWidth = bounding.width * (widthPercent / 100);
    const lineColor = indicator.styles?.lines?.[0]?.color || 'rgba(33, 150, 243, 0.6)';
    for (let row = 0; row < rowCount; row += 1) {
      if (rows[row] <= 0) continue;
      const width = (rows[row] / maxVolume) * maxWidth;
      const y1 = yAxis.convertToPixel(minPrice + row * rowHeight);
      const y2 = yAxis.convertToPixel(minPrice + (row + 1) * rowHeight);
      ctx.fillStyle = inValueArea[row] ? lineColor : 'rgba(33, 150, 243, 0.2)';
      ctx.fillRect(bounding.width - width, Math.min(y1, y2), width, Math.max(1, Math.abs(y2 - y1) - 1));
    }
    const pocY = yAxis.convertToPixel(minPrice + (pocIndex + 0.5) * rowHeight);
    ctx.beginPath();
    ctx.moveTo(bounding.width - maxWidth, pocY);
    ctx.lineTo(bounding.width, pocY);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();
    return true;
  },
};
