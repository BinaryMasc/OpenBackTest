import type { IndicatorTemplate } from 'klinecharts';
import type { IndicatorLevel } from '../../../services/indicatorLevels';
import { loadBitcoinGex } from '../../../services/bitcoinGex';
import { DEFAULT_STOP_THRESHOLD_MILLIONS, isUsdtPair, loadStopLiquidity } from '../../../services/stopLiquidity';
import type { CustomIndicatorDefinition } from '../indicatorDefinition';

const draw: IndicatorTemplate['draw'] = ({ ctx, kLineDataList, indicator, visibleRange, bounding, yAxis }) => {
  const levels: IndicatorLevel[] = indicator.extendData?.levels ?? [];
  if (!levels.length || !kLineDataList.length || visibleRange.to < kLineDataList.length) return true;
  const { color, settings, opacity } = indicator.extendData;
  const rows = levels.map(level => ({ ...level, y: yAxis.convertToPixel(level.price) }))
    .filter(row => row.y >= 0 && row.y < bounding.height).sort((a, b) => a.y - b.y);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  let previous = -8;
  const labels = rows.map(row => {
    previous = Math.max(previous + 15, row.y);
    return previous;
  });
  let bottom = bounding.height - 7;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const labelY = Math.min(labels[i], bottom);
    bottom = labelY - 15;
    const text = `${row.label} · ${row.price}`;
    const end = Math.max(0, bounding.width - ctx.measureText(text).width - 12);
    ctx.strokeStyle = ctx.fillStyle = (row.colorKey && settings?.[row.colorKey]) || color;
    if (row.stopTier) {
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = row.colorKey === 'sellColor' ? 6 : 0;
      ctx.lineWidth = Math.min(row.stopTier, 6);
    }
    ctx.beginPath();
    ctx.moveTo(0, row.y);
    ctx.lineTo(end - 8, row.y);
    ctx.lineTo(end, labelY);
    ctx.stroke();
    ctx.fillText(text, bounding.width - 4, labelY);
  }
  ctx.restore();
  return true;
};

export const bitcoinGex: CustomIndicatorDefinition = {
  template: { name: 'BTC GEX', calc: () => [], draw },
  label: 'Bitcoin Gamma Exposure & Max Pain', perInstance: true,
  compatibility: {
    sourceIds: ['binance'], symbols: ['BTCUSDT'], message: 'Requires Binance Futures BTCUSDT at the live edge. Options data from Deribit.',
    levelFeed: { refreshMs: 60_000, load: loadBitcoinGex },
  },
  colorLabel: 'Positive GEX', defaultColor: '#34d399',
  settings: [
    { key: 'negativeColor', type: 'color', label: 'Negative GEX', default: '#fb7185' },
    { key: 'painColor', type: 'color', label: 'Max pain', default: '#c084fc' },
    { key: 'showGammaFlip', type: 'checkbox', label: 'Show gamma flip', default: false },
    { key: 'flipColor', type: 'color', label: 'Gamma flip color', default: '#fbbf24' },
  ],
  parameterHelp: 'The three largest net GEX strikes use the nearest Deribit BTC inverse-option expiry. USD strikes are converted to USDT using Deribit BTC index prices. Exposure per 1% spot move assumes positive call gamma and negative put gamma. Max pain minimizes aggregate intrinsic payout at expiry. Gamma flip marks the nearest modeled change in net gamma sign within 20% of spot, using fixed mark implied volatilities and forward-to-spot ratios.',
};

export const stopLiquidity: CustomIndicatorDefinition = {
  template: { name: 'Stop Liquidity', calcParams: [DEFAULT_STOP_THRESHOLD_MILLIONS], calc: () => [], draw },
  parameters: [{ label: 'Minimum notional (USD millions)', min: 0 }],
  matchesLevel: (level, [threshold]) => {
    const minimum = Number.isFinite(threshold) && threshold >= 0 ? threshold : DEFAULT_STOP_THRESHOLD_MILLIONS;
    return (level.notionalUsd ?? 0) >= minimum * 1_000_000;
  },
  label: 'Stop Liquidity · Buy Stops & Sell Stops', perInstance: true,
  compatibility: {
    sourceIds: ['binance'], matchesSymbol: isUsdtPair,
    message: 'Requires a live Binance USDT pair with a matching Hyperliquid coin.',
    levelFeed: { refreshMs: 300_000, load: loadStopLiquidity },
  },
  colorLabel: 'Buy stops', defaultColor: '#38bdf8',
  settings: [{ key: 'sellColor', type: 'color', label: 'Sell stops', default: '#fb7185' }],
  parameterHelp: 'Data by Blockmetric. Each dashed line marks the midpoint of a Hyperliquid price bucket where reported buy-stop or sell-stop notional meets the selected minimum. The minimum applies to each side separately. Set it to 0 to show all reported stops. Width increases per $10M up to $60M. Labels show the reported amount. Prices are converted to USDT.',
};
