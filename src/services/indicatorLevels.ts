/** A price level from the latest public snapshot. colorKey refers to an indicator setting. */
export interface IndicatorLevel {
  price: number;
  label: string;
  colorKey?: string;
  visibleWhen?: string;
  /** Stop liquidity in whole $10M increments, used to size dashed lines. */
  stopTier?: number;
  notionalUsd?: number;
}

export interface LevelFeed {
  refreshMs: number;
  load: (symbol: string, signal: AbortSignal) => Promise<IndicatorLevel[] | LevelSnapshot>;
}

export interface LevelSnapshot {
  levels: IndicatorLevel[];
  message: string;
  attribution?: { text: string; url: string };
}

interface Subscription {
  listeners: Set<(snapshot: LevelSnapshot) => void>;
  snapshot?: LevelSnapshot;
  controller: AbortController;
  timer?: ReturnType<typeof setTimeout>;
}

// Charts displaying the same instrument share a poll and release it with the last listener.
const subscriptions = new WeakMap<LevelFeed, Map<string, Subscription>>();

export function subscribeIndicatorLevels(feed: LevelFeed, symbol: string, listener: (snapshot: LevelSnapshot) => void) {
  const symbols = subscriptions.get(feed) ?? new Map<string, Subscription>();
  subscriptions.set(feed, symbols);
  let subscription = symbols.get(symbol);
  if (!subscription) {
    const current: Subscription = { listeners: new Set(), controller: new AbortController() };
    subscription = current;
    symbols.set(symbol, current);
    const poll = async () => {
      const { signal } = current.controller;
      let snapshot: LevelSnapshot;
      try {
        const result = await feed.load(symbol, AbortSignal.any([signal, AbortSignal.timeout(20_000)]));
        snapshot = Array.isArray(result)
          ? { levels: result, message: result.length ? 'Live' : 'No qualifying levels' }
          : result;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Request failed';
        snapshot = { levels: [], message: `Data unavailable · ${reason} · retrying` };
      }
      if (signal.aborted) return;
      current.snapshot = snapshot;
      current.listeners.forEach(notify => notify(snapshot));
      current.timer = setTimeout(poll, feed.refreshMs);
    };
    void poll();
  }
  const current = subscription;
  current.listeners.add(listener);
  if (current.snapshot) listener(current.snapshot);
  return () => {
    current.listeners.delete(listener);
    if (!current.listeners.size) {
      current.controller.abort();
      clearTimeout(current.timer);
      symbols.delete(symbol);
    }
  };
}
