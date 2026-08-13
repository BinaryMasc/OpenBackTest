import type { Candle, MarketSymbol } from '../types';
import type { MarketDataConnection, MarketDataSource } from './marketData';

const SOURCE_ID = 'binance';
const SOURCE_NAME = 'Binance Futures';

interface BinanceExchangeInfo {
  symbols: Array<{
    symbol: string;
    contractType: string;
    status: string;
  }>;
}

type BinanceKline = [number, string, string, string, string, string, ...unknown[]];

const createBinanceConnection = (): MarketDataConnection => ({
  sourceId: SOURCE_ID,
  sourceName: SOURCE_NAME,

  listSymbols: async (): Promise<MarketSymbol[]> => {
    const symbols = await BinanceService.fetchFuturesSymbols();
    return symbols.map(symbol => ({
      symbol,
      displayName: symbol,
      assetType: 'crypto-perpetual'
    }));
  },

  fetchHistoricalCandles: (symbol, interval = '1m', limit = 1000) =>
    BinanceService.fetchHistoricalKlines(symbol, interval, limit),

  subscribeCandles: (symbol, interval, onCandle) =>
    BinanceService.startLiveCandlePolling(symbol, interval, onCandle),

  close: () => {
    // Binance REST polling has no connection-level resources. The individual
    // subscription returned by subscribeCandles owns its timer.
  }
});

export const BinanceService: MarketDataSource & {
  fetchFuturesSymbols: () => Promise<string[]>;
  fetchHistoricalKlines: (symbol: string, interval?: string, limit?: number) => Promise<Candle[]>;
  startLiveCandlePolling: (
    symbol: string,
    interval: string,
    onCandle: (candle: Candle) => void
  ) => { close: () => void };
} = {
  id: SOURCE_ID,
  name: SOURCE_NAME,

  connect: async () => createBinanceConnection(),

  /**
   * Fetches trading perpetual futures symbols from Binance
   */
  async fetchFuturesSymbols(): Promise<string[]> {
    const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const data = await response.json() as BinanceExchangeInfo;
    return data.symbols
      .filter(s => (s.contractType === 'PERPETUAL' || s.contractType === 'TRADIFI_PERPETUAL') && s.status === 'TRADING')
      .map(s => s.symbol);
  },

  /**
   * Fetches historical klines for a given symbol and interval
   * Will paginate backwards automatically if limit > 1500
   */
  async fetchHistoricalKlines(symbol: string, interval: string = '1m', limit: number = 1000): Promise<Candle[]> {
    let allCandles: Candle[] = [];
    let endTime: number | undefined = undefined;
    const maxBatch = 1500; // Binance Futures max limit per request
    
    while (allCandles.length < limit) {
      const currentLimit: number = Math.min(limit - allCandles.length, maxBatch);
      const url: string = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${currentLimit}${endTime ? `&endTime=${endTime}` : ''}`;
      
      const response: Response = await fetch(url);
      const data = await response.json() as BinanceKline[];
      
      if (!data || data.length === 0) break;
      
      const parsed = data.map(d => ({
        time: Math.floor(d[0] / 1000),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));
      
      allCandles = [...parsed, ...allCandles];
      endTime = data[0][0] - 1; // Start next batch just before the oldest candle in this batch
      
      if (data.length < currentLimit) break; // Exhausted available history
    }
    
    return allCandles;
  },

  /**
   * Starts polling for live candles using the REST API
   * Returns an object with a close() method to stop polling
   */
  startLiveCandlePolling(symbol: string, interval: string = '1m', onCandle: (candle: Candle) => void): { close: () => void } {
    const pollInterval = setInterval(async () => {
      try {
        const candles = await this.fetchHistoricalKlines(symbol, interval, 2);
        if (candles && candles.length > 0) {
          candles.forEach(candle => onCandle(candle));
        }
      } catch (err) {
        console.error('Failed to poll live candle', err);
      }
    }, 1500); // Poll every 1.5 seconds

    return { close: () => clearInterval(pollInterval) };
  }
};
