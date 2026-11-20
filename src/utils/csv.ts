import type { Candle } from '../types';

export interface ParsedCandleCsv {
  candles: Candle[];
  /** Symbol taken from the first data row's `symbol` column, if present. */
  symbol: string;
}

const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Parses `datetime,open,high,low,close,volume[,symbol]` CSV text into candles
 * sorted by time. Datetimes are read as UTC. Work is chunked into ~100 slices
 * that yield to the browser so large files keep the UI responsive.
 */
export async function parseCandleCsv(
  text: string,
  onProgress?: (percent: number) => void,
): Promise<ParsedCandleCsv> {
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) return { candles: [], symbol: '' };

  const header = lines[0].split(',').map(column => column.trim());
  const column = (name: string) => header.lastIndexOf(name);
  const index = {
    datetime: column('datetime'),
    open: column('open'),
    high: column('high'),
    low: column('low'),
    close: column('close'),
    volume: column('volume'),
    symbol: column('symbol'),
  };

  const dataLines = lines.slice(1);
  const symbol = index.symbol >= 0 && dataLines.length > 0
    ? dataLines[0].split(',')[index.symbol]?.trim() || ''
    : '';

  const parseLine = (line: string): Candle | null => {
    const values = line.split(',');
    const field = (position: number) => values[position]?.trim();
    const datetime = field(index.datetime);
    if (!datetime) return null;

    const time = Math.floor(new Date(`${datetime.replace(' ', 'T')}Z`).getTime() / 1000);
    if (Number.isNaN(time)) return null;

    return {
      time,
      open: parseFloat(field(index.open)),
      high: parseFloat(field(index.high)),
      low: parseFloat(field(index.low)),
      close: parseFloat(field(index.close)),
      volume: parseFloat(field(index.volume)),
    };
  };

  const candles: Candle[] = [];
  const chunkSize = Math.max(100, Math.floor(dataLines.length / 100));
  for (let start = 0; start < dataLines.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, dataLines.length);
    for (let i = start; i < end; i++) {
      const candle = parseLine(dataLines[i]);
      if (candle) candles.push(candle);
    }
    onProgress?.(Math.round((end / dataLines.length) * 100));
    await yieldToBrowser();
  }

  candles.sort((a, b) => a.time - b.time);
  return { candles, symbol };
}
