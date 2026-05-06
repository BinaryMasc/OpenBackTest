import { registerIndicator } from 'klinecharts';
import type { IndicatorTemplate, IndicatorDrawParams } from 'klinecharts';
import { IndicatorSeries } from 'klinecharts';

export const CUSTOM_INDICATORS_LIST = ['VPVR'] as const;
export const CUSTOM_INDICATOR_PARAMS: Record<string, number[]> = {
  VPVR: [120, 30, 70],
};

export function registerCustomIndicators(): void {
  const VPVRIndicator: IndicatorTemplate = {
    name: 'VPVR',
    shortName: 'VPVR',
    series: IndicatorSeries.Normal,
    calcParams: CUSTOM_INDICATOR_PARAMS['VPVR'],
    shouldOhlc: false,
    calc: (dataList) => {
      // VPVR is drawn dynamically based on visible range, so we don't need to return per-candle data.
      return dataList.map(() => ({}));
    },
    draw: ({
      ctx,
      kLineDataList,
      visibleRange,
      bounding,
      // xAxis, // disable warning
      yAxis,
      indicator
    }: IndicatorDrawParams) => {
      if (visibleRange.from >= visibleRange.to) return false;

      const rowCount = Number(indicator.calcParams[0]) || 120;
      const widthPercent = Number(indicator.calcParams[1]) || 30;
      const vaPercent = Number(indicator.calcParams[2]) || 70;

      // Calculate min and max price in the visible range
      let maxPrice = -Infinity;
      let minPrice = Infinity;
      for (let i = visibleRange.from; i < visibleRange.to; i++) {
        const data = kLineDataList[i];
        if (!data) continue;
        if (data.high !== undefined && data.high > maxPrice) maxPrice = data.high;
        if (data.low !== undefined && data.low < minPrice) minPrice = data.low;
      }

      if (maxPrice === -Infinity || minPrice === Infinity || maxPrice === minPrice) return false;

      const priceRange = maxPrice - minPrice;
      const rowHeight = priceRange / rowCount;

      // Initialize rows
      const rows = new Array(rowCount).fill(0);

      // Smooth volume distribution
      for (let i = visibleRange.from; i < visibleRange.to; i++) {
        const data = kLineDataList[i];
        if (!data || data.volume === undefined || data.volume === 0) continue;

        const high = data.high;
        const low = data.low;

        if (high === low) {
          const index = Math.max(0, Math.min(rowCount - 1, Math.floor((high - minPrice) / rowHeight)));
          rows[index] += data.volume;
        } else {
          const candleRange = high - low;
          const volPerPrice = data.volume / candleRange;

          // Find overlapping rows
          const startIndex = Math.floor((low - minPrice) / rowHeight);
          const endIndex = Math.floor((high - minPrice) / rowHeight);

          for (let j = startIndex; j <= endIndex; j++) {
            if (j < 0 || j >= rowCount) continue;
            const rowBottom = minPrice + j * rowHeight;
            const rowTop = rowBottom + rowHeight;

            const overlapBottom = Math.max(low, rowBottom);
            const overlapTop = Math.min(high, rowTop);

            if (overlapTop > overlapBottom) {
              const overlap = overlapTop - overlapBottom;
              rows[j] += volPerPrice * overlap;
            }
          }
        }
      }

      // Find POC and total volume
      let maxVol = 0;
      let pocIndex = 0;
      let totalVol = 0;

      for (let i = 0; i < rowCount; i++) {
        totalVol += rows[i];
        if (rows[i] > maxVol) {
          maxVol = rows[i];
          pocIndex = i;
        }
      }

      if (maxVol === 0) return false;

      // Calculate Value Area
      const targetVaVol = totalVol * (vaPercent / 100);
      let currentVaVol = rows[pocIndex];
      let upperIndex = pocIndex + 1;
      let lowerIndex = pocIndex - 1;

      const inVa = new Array(rowCount).fill(false);
      inVa[pocIndex] = true;

      while (currentVaVol < targetVaVol && (upperIndex < rowCount || lowerIndex >= 0)) {
        let volUpper = 0;
        let volLower = 0;

        if (upperIndex < rowCount) {
          volUpper = rows[upperIndex] + (upperIndex + 1 < rowCount ? rows[upperIndex + 1] : 0);
        }
        if (lowerIndex >= 0) {
          volLower = rows[lowerIndex] + (lowerIndex - 1 >= 0 ? rows[lowerIndex - 1] : 0);
        }

        if (volUpper >= volLower && upperIndex < rowCount) {
          currentVaVol += rows[upperIndex];
          inVa[upperIndex] = true;
          upperIndex++;
          if (currentVaVol < targetVaVol && upperIndex < rowCount) {
            currentVaVol += rows[upperIndex];
            inVa[upperIndex] = true;
            upperIndex++;
          }
        } else if (lowerIndex >= 0) {
          currentVaVol += rows[lowerIndex];
          inVa[lowerIndex] = true;
          lowerIndex--;
          if (currentVaVol < targetVaVol && lowerIndex >= 0) {
            currentVaVol += rows[lowerIndex];
            inVa[lowerIndex] = true;
            lowerIndex--;
          }
        } else {
          break; // Should not happen if loop condition is correct
        }
      }

      // Draw
      const maxWidthPx = bounding.width * (widthPercent / 100);

      // Extract colors from styles or use defaults
      const lines = indicator.styles?.lines || [];
      const vaColor = lines.length > 0 && lines[0].color ? lines[0].color : 'rgba(33, 150, 243, 0.6)';
      const nonVaColor = 'rgba(33, 150, 243, 0.2)'; // Faded version of primary color
      const pocColor = '#ef4444'; // Red

      for (let i = 0; i < rowCount; i++) {
        if (rows[i] === 0) continue;

        const rowVol = rows[i];
        const barWidth = (rowVol / maxVol) * maxWidthPx;

        const rowBottomPrice = minPrice + i * rowHeight;
        const rowTopPrice = rowBottomPrice + rowHeight;

        const yBottom = yAxis.convertToPixel(rowBottomPrice);
        const yTop = yAxis.convertToPixel(rowTopPrice);

        const yMin = Math.min(yBottom, yTop);
        const rectHeight = Math.abs(yBottom - yTop);

        ctx.fillStyle = inVa[i] ? vaColor : nonVaColor;

        // Draw from right to left
        ctx.fillRect(bounding.width - barWidth, yMin, barWidth, rectHeight > 1 ? rectHeight - 1 : rectHeight);
      }

      // Draw POC line
      const pocPrice = minPrice + pocIndex * rowHeight + rowHeight / 2;
      const pocY = yAxis.convertToPixel(pocPrice);

      ctx.beginPath();
      ctx.moveTo(bounding.width - maxWidthPx, pocY);
      ctx.lineTo(bounding.width, pocY);
      ctx.strokeStyle = pocColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.stroke();

      return true;
    }
  };

  registerIndicator(VPVRIndicator);
}
