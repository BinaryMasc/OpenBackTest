import { useEffect, useMemo, useState } from 'react';
import { getCustomIndicator } from '../lib/chart/customIndicators';
import { supportsIndicator, type IndicatorContext } from '../lib/chart/indicatorDefinition';
import { subscribeIndicatorLevels, type LevelSnapshot } from '../services/indicatorLevels';
import type { IndicatorInstance } from '../types/indicatorTypes';

export function useIndicatorFeeds(instances: IndicatorInstance[], context?: IndicatorContext) {
  // Style edits, duplicate instances and incoming candles keep the same subscription.
  const names = instances.filter(instance => {
    const definition = getCustomIndicator(instance.name);
    return instance.visible && definition?.compatibility?.levelFeed && supportsIndicator(definition, context);
  }).map(instance => instance.name);
  const namesKey = JSON.stringify([...new Set(names)].sort());
  const symbol = context?.symbol ?? '';
  const source = context?.sourceId;
  const request = useMemo(() => ({ names: JSON.parse(namesKey) as string[], symbol, source }), [namesKey, symbol, source]);
  const [result, setResult] = useState<{ request: typeof request; data: Record<string, LevelSnapshot> }>();

  useEffect(() => {
    const releases = request.names.map(name => {
      const feed = getCustomIndicator(name)!.compatibility!.levelFeed!;
      return subscribeIndicatorLevels(feed, request.symbol, snapshot => {
        setResult(previous => ({
          request,
          data: { ...(previous?.request === request && previous.data), [name]: snapshot },
        }));
      });
    });
    return () => releases.forEach(release => release());
  }, [request]);

  return result?.request === request ? result.data : undefined;
}
