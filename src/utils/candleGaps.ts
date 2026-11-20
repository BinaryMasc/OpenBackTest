import type { Candle } from '../types';

/** Gaps longer than a trading session are left as real market closures. */
export const MAX_SYNTHETIC_CANDLE_GAP_SECONDS = 12 * 60 * 60;

/**
 * Trade-replay feeds only emit minutes that contain a trade. Charting feeds
 * normally expose a flat, zero-volume bar for short inactive intervals. Fill
 * those short intervals so a quiet part of an open session does not look like
 * a broken chart, while leaving long market/session breaks untouched.
 */
/** Flat, zero-volume bars continuing `previous` up to (excluding) `untilTime`. */
export function flatCandlesUntil(previous: Candle, untilTime: number, intervalSeconds = 60): Candle[] {
  const filler: Candle[] = [];
  for (let time = previous.time + intervalSeconds; time < untilTime; time += intervalSeconds) {
    filler.push({
      time,
      open: previous.close,
      high: previous.close,
      low: previous.close,
      close: previous.close,
      volume: 0,
      symbol: previous.symbol,
    });
  }
  return filler;
}

export function fillShortCandleGaps(
  candles: Candle[],
  intervalSeconds = 60,
  maximumGapSeconds = MAX_SYNTHETIC_CANDLE_GAP_SECONDS
): Candle[] {
  if (candles.length < 2 || intervalSeconds <= 0) return candles;

  const sorted = [...candles].sort((left, right) => left.time - right.time);
  const result: Candle[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const candle = sorted[index];
    const previous = result[result.length - 1];

    if (!previous || candle.time > previous.time) {
      result.push(candle);
    } else if (candle.time === previous.time) {
      // Keep the latest update for a duplicated minute.
      result[result.length - 1] = candle;
      continue;
    } else {
      continue;
    }

    const next = sorted[index + 1];
    if (!next || next.time <= candle.time) continue;

    const gapSeconds = next.time - candle.time;
    if (gapSeconds <= intervalSeconds || gapSeconds > maximumGapSeconds) continue;

    result.push(...flatCandlesUntil(candle, next.time, intervalSeconds));
  }

  return result;
}
