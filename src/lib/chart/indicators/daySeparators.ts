import type { IndicatorDrawParams, IndicatorSeries, IndicatorTemplate } from 'klinecharts';

/**
 * Vertical lines marking where a new trading day starts.
 *
 * A "day" is defined by a timezone and a session start time, so markets that
 * roll over at a time other than midnight (e.g. CME futures at 17:00 Chicago)
 * can be separated correctly. Settings travel in the indicator's extendData.
 */

export const DAY_SEPARATOR_INDICATOR_NAME = 'DAY_SEPARATOR';

export type DaySeparatorLineStyle = 'solid' | 'dashed' | 'dotted';

export interface DaySeparatorSettings {
  enabled: boolean;
  color: string;
  opacity: number;
  lineStyle: DaySeparatorLineStyle;
  /** 'local' (browser timezone, as on the chart axis), 'UTC', or an IANA zone. */
  timezone: string;
  /** Session start in the selected timezone, "HH:MM". */
  sessionStart: string;
}

export const DEFAULT_DAY_SEPARATOR_SETTINGS: DaySeparatorSettings = {
  enabled: true,
  color: '#94a3b8',
  opacity: 0.35,
  lineStyle: 'dashed',
  timezone: 'local',
  sessionStart: '00:00',
};

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Minutes after midnight for "HH:MM"; invalid input means midnight. */
export function parseSessionStart(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return 0;
  return hours * 60 + minutes;
}

type OffsetFn = (timestamp: number) => number;

function zoneOffsetFn(timezone: string): OffsetFn {
  if (timezone === 'UTC') return () => 0;
  if (timezone === 'local') return timestamp => -new Date(timestamp).getTimezoneOffset() * 60_000;

  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  } catch {
    return () => 0; // Unknown zone: fall back to UTC.
  }

  // Offsets only change on the hour, so cache them per hour.
  const cache = new Map<number, number>();
  return timestamp => {
    const hour = Math.floor(timestamp / HOUR_MS);
    let offset = cache.get(hour);
    if (offset === undefined) {
      const at = hour * HOUR_MS;
      const parts: Record<string, number> = {};
      for (const part of format.formatToParts(at)) parts[part.type] = Number(part.value);
      offset = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - at;
      cache.set(hour, offset);
    }
    return offset;
  };
}

/**
 * Returns a function mapping a timestamp (ms) to a session-day number; two
 * timestamps are in the same trading day exactly when their numbers match.
 */
export function createSessionDayKey(timezone: string, sessionStart: string): (timestamp: number) => number {
  const offsetOf = zoneOffsetFn(timezone);
  const startMs = parseSessionStart(sessionStart) * 60_000;
  return timestamp => Math.floor((timestamp + offsetOf(timestamp) - startMs) / DAY_MS);
}

const dayKeyCache = new Map<string, (timestamp: number) => number>();

function getSessionDayKey(timezone: string, sessionStart: string) {
  const cacheKey = `${timezone}|${sessionStart}`;
  let dayKey = dayKeyCache.get(cacheKey);
  if (!dayKey) {
    dayKey = createSessionDayKey(timezone, sessionStart);
    dayKeyCache.set(cacheKey, dayKey);
  }
  return dayKey;
}

const LINE_DASH: Record<DaySeparatorLineStyle, number[]> = {
  solid: [],
  dashed: [6, 4],
  dotted: [1, 3],
};

/** Data indexes in [from, to) whose bar starts a new session day. */
export function findDayStarts(timestamps: (index: number) => number, from: number, to: number, dayKey: (timestamp: number) => number): number[] {
  const starts: number[] = [];
  if (to - from < 1) return starts;
  let previousKey = dayKey(timestamps(Math.max(0, from - 1)));
  for (let index = Math.max(1, from); index < to; index++) {
    const key = dayKey(timestamps(index));
    if (key !== previousKey) starts.push(index);
    previousKey = key;
  }
  return starts;
}

export const DAY_SEPARATOR_INDICATOR: IndicatorTemplate<Record<string, never>> = {
  name: DAY_SEPARATOR_INDICATOR_NAME,
  shortName: '',
  series: 'normal' as IndicatorSeries,
  calcParams: [],
  shouldOhlc: false,
  extendData: DEFAULT_DAY_SEPARATOR_SETTINGS,
  calc: dataList => dataList.map(() => ({})),
  draw: ({ ctx, kLineDataList, visibleRange, bounding, barSpace, xAxis, indicator }: IndicatorDrawParams<Record<string, never>>) => {
    const settings = { ...DEFAULT_DAY_SEPARATOR_SETTINGS, ...(indicator.extendData as Partial<DaySeparatorSettings> | undefined) };
    const from = Math.max(1, visibleRange.from);
    const to = Math.min(visibleRange.to, kLineDataList.length);
    if (!settings.enabled || to <= from) return true;

    // Daily and higher bars would put a line between every candle.
    let interval = Infinity;
    for (let index = from; index < to && interval >= DAY_MS; index++) {
      interval = Math.min(interval, kLineDataList[index].timestamp - kLineDataList[index - 1].timestamp);
    }
    if (interval >= DAY_MS) return true;

    const dayKey = getSessionDayKey(settings.timezone, settings.sessionStart);
    const starts = findDayStarts(index => kLineDataList[index].timestamp, from, to, dayKey);
    if (starts.length === 0) return true;

    ctx.save();
    ctx.strokeStyle = settings.color;
    ctx.globalAlpha = Math.max(0, Math.min(1, settings.opacity));
    ctx.lineWidth = 1;
    ctx.setLineDash(LINE_DASH[settings.lineStyle] ?? LINE_DASH.dashed);
    ctx.beginPath();
    for (const index of starts) {
      // Between the previous bar and the first bar of the new day.
      const x = Math.round(xAxis.convertToPixel(index) - barSpace.halfBar) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, bounding.height);
    }
    ctx.stroke();
    ctx.restore();
    return true;
  },
};
