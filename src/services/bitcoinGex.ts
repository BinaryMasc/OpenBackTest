import { findGammaFlip, type GammaOption } from './gammaFlip';
import type { IndicatorLevel } from './indicatorLevels';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

interface StrikeExposure {
  calls: number;
  puts: number;
  gex: number;
}

function maxPain(strikes: Map<number, StrikeExposure>) {
  let lowestPayout = Infinity;
  let pain = Infinity;
  for (const price of strikes.keys()) {
    let payout = 0;
    for (const [strike, { calls, puts }] of strikes) {
      payout += calls * Math.max(0, price - strike) + puts * Math.max(0, strike - price);
    }
    if (payout < lowestPayout || (payout === lowestPayout && price < pain)) {
      lowestPayout = payout;
      pain = price;
    }
  }
  return pain;
}

interface DeribitOption {
  instrument_name: string;
  open_interest: number;
  mark_iv: number;
  underlying_price: number;
}

const months = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');

async function deribitResult<T>(method: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`https://www.deribit.com/api/v2/public/${method}`, { signal });
  if (!response.ok) throw new Error(`Deribit HTTP ${response.status}`);
  const body = await response.json();
  if (body.error || body.result == null) throw new Error(body.error?.message || 'Missing Deribit data');
  return body.result;
}

async function btcIndex(name: string, signal: AbortSignal) {
  const { index_price: price } = await deribitResult<{ index_price: number }>(`get_index_price?index_name=${name}`, signal);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid Deribit ${name} index`);
  return price;
}

export async function loadBitcoinGex(_symbol: string, signal: AbortSignal): Promise<IndicatorLevel[]> {
  const [summary, usd, usdt] = await Promise.all([
    deribitResult<DeribitOption[]>('get_book_summary_by_currency?currency=BTC&kind=option', signal),
    btcIndex('btc_usd', signal), btcIndex('btc_usdt', signal),
  ]);
  const now = Date.now();
  const contracts = summary.flatMap(row => {
    const match = /^BTC-(\d{1,2})([A-Z]{3})(\d{2})-(\d+(?:\.\d+)?)-([CP])$/.exec(row.instrument_name);
    if (!match) return [];
    const [, day, month, year, strike, side] = match;
    const monthIndex = months.indexOf(month);
    if (monthIndex < 0 || Number(strike) <= 0) return [];
    const expiry = Date.UTC(2000 + Number(year), monthIndex, Number(day), 8);
    return expiry > now ? [{ ...row, expiry, strike: Number(strike), side }] : [];
  });
  if (!contracts.length) return [];
  const expiry = Math.min(...contracts.map(c => c.expiry));
  const date = new Date(expiry).toISOString().slice(0, 10);
  const years = (expiry - now) / (365 * 86_400_000);
  const options: GammaOption[] = [];
  const strikes = new Map<number, StrikeExposure>();
  for (const contract of contracts) {
    if (contract.expiry !== expiry) continue;
    const size = contract.open_interest;
    if (!Number.isFinite(size) || size < 0) throw new Error('Invalid Deribit open interest');
    if (size === 0) continue;
    const volatility = contract.mark_iv / 100;
    const forward = contract.underlying_price;
    if (!Number.isFinite(volatility) || volatility <= 0) throw new Error('Invalid Deribit mark IV');
    if (!Number.isFinite(forward) || forward <= 0) throw new Error('Invalid Deribit forward price');
    const deviation = volatility * Math.sqrt(years);
    const d1 = Math.log(forward / contract.strike) / deviation + deviation / 2;
    const gamma = Math.exp(-0.5 * d1 * d1) / (usd * deviation * Math.sqrt(2 * Math.PI));
    const row = strikes.get(contract.strike) ?? { calls: 0, puts: 0, gex: 0 };
    const call = contract.side === 'C';
    // Holding the observed forward/spot ratio fixed gives a spot-equivalent strike for repricing.
    options.push({ strike: contract.strike * usd / forward, signedSize: call ? size : -size, volatility });
    if (call) row.calls += size;
    else row.puts += size;
    row.gex += (call ? 1 : -1) * gamma * size * usd ** 2 * 0.01;
    strikes.set(contract.strike, row);
  }
  if (!strikes.size) return [];
  const toUsdt = (strike: number) => Number((strike * usdt / usd).toFixed(2));
  const levels: IndicatorLevel[] = [...strikes].filter(([, row]) => row.gex !== 0)
    .sort((a, b) => Math.abs(b[1].gex) - Math.abs(a[1].gex))
    .slice(0, 3).map(([strike, { gex }]) => ({
      price: toUsdt(strike), label: `GEX ${compact.format(gex)} USD`, colorKey: gex < 0 ? 'negativeColor' : undefined,
    }));
  levels.push({ price: toUsdt(maxPain(strikes)), label: `Max pain ${date}`, colorKey: 'painColor' });
  const flip = findGammaFlip(options, usd, years);
  if (flip !== undefined) {
    levels.push({ price: toUsdt(flip), label: 'Gamma flip', colorKey: 'flipColor', visibleWhen: 'showGammaFlip' });
  }
  return levels;
}
