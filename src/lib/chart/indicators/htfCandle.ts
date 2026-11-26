import type { IndicatorTemplate, KLineData } from 'klinecharts';
import { TIMEFRAMES, TIMEFRAME_SECONDS, type Timeframe } from '../../../types';
import { candleBucketStart } from '../../../utils/aggregation';
import type { CustomIndicatorDefinition } from '../indicatorDefinition';

import { DEFAULT_CANDLE_COLORS } from '../candleColors';

type Bar = Pick<KLineData, 'timestamp' | 'open' | 'high' | 'low' | 'close'>;
interface Projection extends Bar {
  first: number;
  highest: number;
  lowest: number;
}

// Walk back only as far as the requested groups. The latest input bar may still be forming.
export function projectCandles(bars: Bar[], timeframe: Timeframe, count: number): Projection[] {
  const candles: Projection[] = [];
  let candle: Projection | undefined;
  for (let i = bars.length - 1; i >= 0; i--) {
    const bar = bars[i];
    const timestamp = candleBucketStart(bar.timestamp / 1000, timeframe) * 1000;
    if (!candle || candle.timestamp !== timestamp) {
      if (candles.length >= count) break;
      candle = { ...bar, timestamp, first: i, highest: i, lowest: i };
      candles.push(candle);
    } else {
      candle.first = i;
      candle.open = bar.open;
      if (bar.high >= candle.high) { candle.high = bar.high; candle.highest = i; }
      if (bar.low <= candle.low) { candle.low = bar.low; candle.lowest = i; }
    }
  }
  return candles.reverse();
}

interface Result { high: number; low: number; candles: Projection[] }
const defaults = [86400, 3, 4];
const spacing = 5; // chart bars per projected candle, including the gap
const labelSpace = 66;

const template: IndicatorTemplate<Result> = {
  name: 'HTF Candle',
  calcParams: defaults,
  figures: [{ key: 'high' }, { key: 'low' }],
  calc: (bars, indicator) => {
    const [seconds, count] = indicator.calcParams;
    const target = TIMEFRAMES.find(tf => TIMEFRAME_SECONDS[tf] === seconds);
    const source: Timeframe = indicator.extendData?.timeframe ?? '1m';
    if (!indicator.visible || !target || seconds <= TIMEFRAME_SECONDS[source] || !bars.length) return [];
    const candles = projectCandles(bars, target, Math.min(50, Math.max(1, Math.floor(count) || 3)));
    const result: Result[] = [];
    result[bars.length - 1] = {
      candles, high: Math.max(...candles.map(c => c.high)), low: Math.min(...candles.map(c => c.low)),
    };
    return result;
  },
  draw: ({ ctx, indicator, kLineDataList, xAxis, yAxis, barSpace }) => {
    const last = kLineDataList.length - 1;
    const candles = indicator.result[last]?.candles;
    if (!candles?.length) return true;
    const { color, opacity, settings } = indicator.extendData;
    const width = Math.max(2, barSpace.bar * 3);
    const left = xAxis.convertToPixel(last + 1 + indicator.calcParams[2]);
    ctx.globalAlpha = opacity;
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    ctx.textBaseline = 'middle';
    for (const [index, candle] of candles.entries()) {
      const x = left + index * spacing * barSpace.bar;
      const center = x + width / 2;
      const open = yAxis.convertToPixel(candle.open);
      const close = yAxis.convertToPixel(candle.close);
      const up = candle.close >= candle.open;
      ctx.strokeStyle = up ? settings.wick : settings.downWick;
      ctx.beginPath();
      ctx.moveTo(center, yAxis.convertToPixel(candle.high));
      ctx.lineTo(center, yAxis.convertToPixel(candle.low));
      ctx.stroke();
      ctx.fillStyle = up ? color : settings.downColor;
      const top = Math.min(open, close);
      const height = Math.max(1, Math.abs(open - close));
      ctx.fillRect(x, top, width, height);
      ctx.strokeRect(x, top, width, height);
      if (index === candles.length - 1 && settings.guides) {
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.fillStyle = ctx.strokeStyle;
        const levels = new Map([[candle.open, candle.first], [candle.high, candle.highest],
          [candle.low, candle.lowest], [candle.close, last]]);
        for (const [price, origin] of levels) {
          const y = yAxis.convertToPixel(price);
          ctx.beginPath();
          ctx.moveTo(xAxis.convertToPixel(origin), y);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.fillText(String(price), x + width + 4, y);
        }
        ctx.restore();
      }
    }
    return true;
  },
};

export const htfCandle: CustomIndicatorDefinition = {
  template, label: 'Higher Timeframe Candle Projections', perInstance: true,
  colorLabel: 'Up body', defaultColor: DEFAULT_CANDLE_COLORS.upColor,
  settings: [
    { key: 'downColor', type: 'color', label: 'Down body', default: DEFAULT_CANDLE_COLORS.downColor },
    { key: 'wick', type: 'color', label: 'Up wick and border', default: DEFAULT_CANDLE_COLORS.upWickColor },
    { key: 'downWick', type: 'color', label: 'Down wick and border', default: DEFAULT_CANDLE_COLORS.downWickColor, legacySettingKey: 'wick' },
    { key: 'guides', type: 'checkbox', label: 'Show latest OHLC guides', default: true },
  ],
  parameters: [
    { label: 'Higher timeframe', options: TIMEFRAMES.slice(1).map(tf => ({ label: tf, value: TIMEFRAME_SECONDS[tf] })) },
    { label: 'Candle count', min: 1, max: 50, integer: true },
    { label: 'Offset (chart bars)', min: 0, integer: true },
  ],
  parameterHelp: 'Choose a timeframe above the chart interval. Daily candles start at midnight UTC.',
  formatParams: ([seconds, count, offset]) => `${TIMEFRAMES.find(tf => TIMEFRAME_SECONDS[tf] === seconds)}, ${count} candles, +${offset} bars`,
  rightMargin: ([seconds, count, offset], timeframe) =>
    seconds > TIMEFRAME_SECONDS[timeframe] ? { bars: offset + count * spacing + 1, pixels: labelSpace } : undefined,
};
