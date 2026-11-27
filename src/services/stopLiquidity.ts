import type { IndicatorLevel, LevelSnapshot } from './indicatorLevels';
import { indexPrice } from './okx';

const MILLION = 1_000_000;
export const DEFAULT_STOP_THRESHOLD_MILLIONS = 10;
const millions = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

interface StopBucket {
  px: number;
  top: number;
  stopBuyUsd: number;
  stopSellUsd: number;
}

interface StopMap {
  coin: string;
  buckets: StopBucket[];
  updatedAt: string | null;
}

export function isUsdtPair(symbol: string) {
  return /^[A-Z0-9]+USDT$/.test(symbol);
}

async function fetchStopMap(coin: string, signal: AbortSignal): Promise<StopMap> {
  const response = await fetch(`https://api.blockmetric.io/v1/whales/stops?coin=${encodeURIComponent(coin)}`, {
    headers: { 'X-Blockmetric-Access': 'public' }, signal,
  });
  if (!response.ok) throw new Error(`Blockmetric HTTP ${response.status}`);
  const result = await response.json();
  const map = result?.data?.map;
  if (!map || map.coin !== coin || !Array.isArray(map.buckets)) {
    throw new Error(`No Hyperliquid stop map for ${coin}`);
  }
  return map;
}

export async function loadStopLiquidity(symbol: string, signal: AbortSignal): Promise<LevelSnapshot> {
  if (!isUsdtPair(symbol)) throw new Error('Stop liquidity requires a USDT pair');
  const coin = symbol.slice(0, -4);
  const [map, usdPerUsdt] = await Promise.all([fetchStopMap(coin, signal), indexPrice('USDT-USD', signal)]);
  const levels: IndicatorLevel[] = [];
  for (const { px, top, stopBuyUsd, stopSellUsd } of map.buckets) {
    if (!Number.isFinite(px) || !Number.isFinite(top) || px <= 0 || top <= px) continue;
    const price = Number(((px + (top - px) / 2) / usdPerUsdt).toPrecision(8));
    for (const side of ['Buy', 'Sell'] as const) {
      const amount = side === 'Buy' ? stopBuyUsd : stopSellUsd;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const notional = amount < MILLION ? dollars.format(amount) : `$${millions.format(amount / MILLION)}M`;
      levels.push({
        price, label: `${side} stops ${notional}`,
        notionalUsd: amount,
        stopTier: Math.max(1, Math.floor(amount / (10 * MILLION))),
        colorKey: side === 'Sell' ? 'sellColor' : undefined,
      });
    }
  }
  const updated = Date.parse(map.updatedAt ?? '');
  const asOf = Number.isFinite(updated) ? new Date(updated).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'Time unavailable';
  return {
    levels, message: `Hyperliquid tracked wallets · ${asOf}`,
    attribution: { text: 'Data by Blockmetric', url: 'https://blockmetric.io/' },
  };
}
