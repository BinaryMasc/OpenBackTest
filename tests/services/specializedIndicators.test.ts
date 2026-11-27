import { afterEach, expect, it, vi } from 'vitest';
import { findGammaFlip } from '../../src/services/gammaFlip';
import { loadBitcoinGex } from '../../src/services/bitcoinGex';
import { loadStopLiquidity } from '../../src/services/stopLiquidity';
import { subscribeIndicatorLevels, type LevelFeed } from '../../src/services/indicatorLevels';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('nets BTC open interest by strike at the nearest unexpired expiry and converts USD strikes to USDT', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 10, 26, 8));
  const contracts = [
    ['26NOV26-99-C', 1000], ['27NOV26-100-C', 3], ['27NOV26-100-P', 1],
    ['27NOV26-110-P', 5], ['28NOV26-90-C', 1000],
  ].map(([id, size]) => ({ instrument_name: 'BTC-' + id, open_interest: size, mark_iv: 50, underlying_price: 103 }));
  const fetchData = vi.fn(async (url: string) => Response.json({ result:
    url.includes('get_index_price') ? { index_price: url.endsWith('btc_usdt') ? 101 : 100 } : contracts,
  }));
  vi.stubGlobal('fetch', fetchData);
  const load = () => loadBitcoinGex('BTCUSDT', new AbortController().signal);
  const levels = await load();
  expect(fetchData.mock.calls.every(([url]) => new URL(url).hostname === 'www.deribit.com')).toBe(true);
  expect(levels.slice(0, 3)).toEqual([
    { price: 101, label: 'GEX 15.9 USD', colorKey: undefined },
    { price: 111.1, label: 'GEX -3.4 USD', colorKey: 'negativeColor' },
    { price: 111.1, label: 'Max pain 2026-11-27', colorKey: 'painColor' },
  ]);
  const [flip] = levels.filter(level => level.visibleWhen === 'showGammaFlip');
  // Net 2 BTC of calls at 100 versus 5 BTC of puts at 110. Compute the
  // equal-density forward, then convert to spot and USDT.
  const variance = 0.5 ** 2 / 365;
  const usdFlip = Math.sqrt(100 * 110) * Math.exp(variance * (Math.log(2 / 5) / Math.log(110 / 100) - 0.5));
  expect(flip.price).toBeCloseTo(usdFlip * 100 / 103 * 1.01, 2);
  contracts[1].mark_iv = 0;
  await expect(load()).rejects.toThrow('Deribit mark IV');
});

it('finds the nearest repriced gamma sign change and ignores flat or incomplete profiles', () => {
  const years = 1 / 365;
  const option = (strike: number, signedSize: number) => ({ strike, signedSize, volatility: 0.25 });
  // For two equally weighted legs with equal IV, equality of their gamma densities
  // puts the crossing at the geometric mean of the strikes adjusted for half variance.
  const expected = (a: number, b: number) => Math.sqrt(a * b) * Math.exp(-(0.25 ** 2) * years / 2);
  const low = option(90, 1), mid = option(100, -1), high = option(110, 1);
  expect(findGammaFlip([low, mid], 100, years)).toBeCloseTo(expected(90, 100), 3);
  expect(findGammaFlip([low, mid, high], 101, years)).toBeCloseTo(expected(100, 110), 3);
  expect(findGammaFlip([low, mid, high], 96, years)).toBeCloseTo(expected(90, 100), 3);
  expect(findGammaFlip([low, high], 100, years)).toBeUndefined();
  expect(findGammaFlip([mid, option(100, 1)], 100, years)).toBeUndefined();
  expect(findGammaFlip([low, mid], 50, years)).toBeUndefined();
  expect(findGammaFlip([low, { ...mid, volatility: NaN }], 100, years)).toBeUndefined();
});

it('sizes buy and sell stops independently in $10M tiers and keeps smaller stops while excluding limits and TPs', async () => {
  const map = { coin: 'ETH', updatedAt: '2026-11-26T14:23:00Z', buckets: [
    { px: 190, top: 210, stopBuyUsd: 10_000_000, stopSellUsd: 37_500_000 },
    { px: 210, top: 230, stopBuyUsd: 9_999_999, stopSellUsd: 9_000_000, tpSellUsd: 1e9, limitBuyUsd: 1e9 },
  ] };
  const fetchData = vi.fn(async (url: string) => Response.json(url.includes('index-tickers')
    ? { code: '0', data: [{ idxPx: '0.8' }] } : { data: { map } }));
  vi.stubGlobal('fetch', fetchData);
  const signal = new AbortController().signal;
  const snapshot = await loadStopLiquidity('ETHUSDT', signal);
  expect(fetchData).toHaveBeenCalledWith('https://api.blockmetric.io/v1/whales/stops?coin=ETH', {
    headers: { 'X-Blockmetric-Access': 'public' }, signal,
  });
  expect(snapshot.levels).toEqual([
    { price: 250, label: 'Buy stops $10M', stopTier: 1, notionalUsd: 10_000_000 },
    { price: 250, label: 'Sell stops $37.5M', stopTier: 3, notionalUsd: 37_500_000, colorKey: 'sellColor' },
    { price: 275, label: 'Buy stops $10M', stopTier: 1, notionalUsd: 9_999_999 },
    { price: 275, label: 'Sell stops $9M', stopTier: 1, notionalUsd: 9_000_000, colorKey: 'sellColor' },
  ]);
  expect(snapshot.message).toContain('2026-11-26 14:23 UTC');
  map.buckets[0].stopBuyUsd = 0;
  map.buckets[0].stopSellUsd = 0;
  map.buckets.splice(1);
  expect(await loadStopLiquidity('ETHUSDT', signal)).toMatchObject({
    levels: [], message: expect.stringContaining('Hyperliquid tracked wallets'),
  });
  await expect(loadStopLiquidity('BTCUSDT', signal)).rejects.toThrow('No Hyperliquid stop map for BTC');
  await expect(loadStopLiquidity('ETHBTC', signal)).rejects.toThrow('USDT');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 429 })));
  await expect(loadStopLiquidity('ETHUSDT', signal)).rejects.toThrow('429');
});

it('shares a poll, clears stale levels on failure, retries, and aborts when the last chart releases it', async () => {
  vi.useFakeTimers();
  const feed = { refreshMs: 1000, load: vi.fn<LevelFeed['load']>().mockResolvedValue([{ price: 10, label: 'Test' }]) };
  const first = vi.fn();
  const second = vi.fn();
  const release = subscribeIndicatorLevels(feed, 'BTCUSDT', first);
  const releaseSecond = subscribeIndicatorLevels(feed, 'BTCUSDT', second);
  await vi.advanceTimersByTimeAsync(0);
  expect(feed.load).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenCalledWith({ levels: [{ price: 10, label: 'Test' }], message: 'Live' });
  expect(second.mock.lastCall).toEqual(first.mock.lastCall);
  release();
  feed.load.mockRejectedValueOnce(new Error('Rate limited'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(second.mock.lastCall?.[0]).toMatchObject({ levels: [], message: expect.stringContaining('Rate limited') });
  await vi.advanceTimersByTimeAsync(1000);
  expect(second.mock.lastCall?.[0].message).toBe('Live');
  releaseSecond();
  expect(feed.load.mock.lastCall?.[1].aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(2000);
  expect(feed.load).toHaveBeenCalledTimes(3);
});
