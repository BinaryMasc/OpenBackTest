export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol?: string;
}

/**
 * A normalized instrument returned by a market-data connection.
 *
 * The optional contract fields are intentionally kept here even though the
 * current Binance feed does not provide them. Futures-oriented connections
 * such as Rithmic need this metadata to calculate prices, quantities, and
 * contract P&L correctly.
 */
export interface MarketSymbol {
  symbol: string;
  displayName?: string;
  exchange?: string;
  assetType?: 'spot' | 'crypto-perpetual' | 'futures' | 'unknown';
  tickSize?: number;
  contractSize?: number;
  pointValue?: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export interface ChartConfig {
  id: string;
  timeframe: Timeframe;
}
