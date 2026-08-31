import type { IndicatorDrawParams, IndicatorSeries, IndicatorTemplate } from 'klinecharts';
import { getIndexRange } from './anchoredVWAP';

/** Rows, width percentage, and value-area percentage. The selected range is stored separately. */
export const ANCHORED_VOLUME_PROFILE_DEFAULT_PARAMS = [120, 30, 70] as const;

type ProfileDrawParams = IndicatorDrawParams<Record<string, never>>;

function drawProfile({ ctx, kLineDataList, visibleRange, bounding, barSpace, xAxis, yAxis, indicator }: ProfileDrawParams): boolean {
  const hasSelectedRange = indicator.calcParams.length >= 5;
  const rangeParams = hasSelectedRange ? indicator.calcParams.slice(0, 2) : indicator.calcParams.slice(0, 1);
  const visualParams = hasSelectedRange ? indicator.calcParams.slice(2) : indicator.calcParams.slice(1);
  const rowCount = Math.max(1, Math.floor(Number(visualParams[0]) || 120));
  const widthPercent = Math.max(1, Math.min(100, Number(visualParams[1]) || 30));
  const valueAreaPercent = Math.max(1, Math.min(100, Number(visualParams[2]) || 70));
  const [start, selectedEnd] = getIndexRange(kLineDataList, rangeParams);
  const end = hasSelectedRange
    ? Math.min(kLineDataList.length, selectedEnd + 1)
    : Math.min(kLineDataList.length, visibleRange.to);
  if (start >= end) return false;

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (let index = start; index < end; index += 1) {
    const candle = kLineDataList[index];
    minPrice = Math.min(minPrice, candle.low);
    maxPrice = Math.max(maxPrice, candle.high);
  }
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice <= minPrice) return false;

  const rowHeight = (maxPrice - minPrice) / rowCount;
  const rows = new Array<number>(rowCount).fill(0);
  for (let index = start; index < end; index += 1) {
    const candle = kLineDataList[index];
    const volume = Number(candle.volume) || 0;
    if (volume <= 0) continue;
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

  const configuredWidth = bounding.width * (widthPercent / 100);
  const startX = hasSelectedRange
    ? xAxis.convertToPixel(start)
    : bounding.width - configuredWidth;
  const selectedRangeWidth = hasSelectedRange
    ? Math.max(barSpace.bar, Math.abs(xAxis.convertToPixel(selectedEnd) - startX) + barSpace.bar)
    : configuredWidth;
  const maxWidth = Math.min(configuredWidth, selectedRangeWidth);
  const lineColor = indicator.styles?.lines?.[0]?.color || 'rgba(33, 150, 243, 0.65)';
  for (let row = 0; row < rowCount; row += 1) {
    if (rows[row] <= 0) continue;
    const width = (rows[row] / maxVolume) * maxWidth;
    const y1 = yAxis.convertToPixel(minPrice + row * rowHeight);
    const y2 = yAxis.convertToPixel(minPrice + (row + 1) * rowHeight);
    ctx.fillStyle = inValueArea[row] ? lineColor : 'rgba(33, 150, 243, 0.2)';
    ctx.fillRect(startX, Math.min(y1, y2), width, Math.max(1, Math.abs(y2 - y1) - 1));
  }

  const pocPrice = minPrice + (pocIndex + 0.5) * rowHeight;
  const pocY = yAxis.convertToPixel(pocPrice);
  ctx.beginPath();
  ctx.moveTo(startX, pocY);
  ctx.lineTo(startX + maxWidth, pocY);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.stroke();
  return true;
}

/** Volume profile calculated from the range selected by its chart overlay. */
export const ANCHORED_VOLUME_PROFILE_INDICATOR: IndicatorTemplate<Record<string, never>> = {
  name: 'AVP',
  shortName: 'AVP',
  series: 'normal' as IndicatorSeries,
  calcParams: [...ANCHORED_VOLUME_PROFILE_DEFAULT_PARAMS],
  shouldOhlc: false,
  calc: dataList => dataList.map(() => ({})),
  draw: drawProfile,
};

export { drawProfile };
