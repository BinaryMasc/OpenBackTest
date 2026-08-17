import type { Candle, MarketSymbol } from '../types';

export interface MarketDataSubscription {
  close: () => void;
}

export interface MarketDataConnectionOptions {
  credentials?: Record<string, string>;
  settings?: Record<string, string | number | boolean>;
}

/**
 * An active connection to a market-data provider.
 *
 * Order routing is deliberately not part of this contract. A future trading
 * adapter can consume the same connection or expose a separate execution
 * interface without making chart data responsible for sending orders.
 */
export interface MarketDataConnection {
  readonly sourceId: string;
  readonly sourceName: string;

  listSymbols: () => Promise<MarketSymbol[]>;
  fetchHistoricalCandles: (symbol: string, interval?: string, limit?: number) => Promise<Candle[]>;
  subscribeCandles: (
    symbol: string,
    interval: string,
    onCandle: (candle: Candle) => void
  ) => MarketDataSubscription;
  close: () => void;
}

/**
 * Provider factory used by the application store. Providers can be added to
 * the registry without changing the chart or simulation code.
 */
export interface MarketDataSource {
  readonly id: string;
  readonly name: string;
  readonly requiresCredentials?: boolean;
  connect: (options?: MarketDataConnectionOptions) => Promise<MarketDataConnection>;
}
