import { BinanceService } from './binance';
import type { MarketDataSource } from './marketData';

const MARKET_DATA_SOURCES: Record<string, MarketDataSource> = {
  [BinanceService.id]: BinanceService
};

export const DEFAULT_MARKET_DATA_SOURCE_ID = BinanceService.id;

export function getMarketDataSource(sourceId: string): MarketDataSource | undefined {
  return MARKET_DATA_SOURCES[sourceId];
}

/** Register an adapter without changing the store or UI wiring. */
export function registerMarketDataSource(source: MarketDataSource): void {
  MARKET_DATA_SOURCES[source.id] = source;
}

export function listMarketDataSources(): MarketDataSource[] {
  return Object.values(MARKET_DATA_SOURCES);
}
