export async function okxData<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(`https://www.okx.com/api/v5/${path}`, { signal });
  if (!response.ok) throw new Error(`OKX HTTP ${response.status}`);
  const result = await response.json();
  if (result.code !== '0' || !Array.isArray(result.data)) throw new Error('OKX data unavailable');
  return result.data;
}

export async function indexPrice(pair: string, signal: AbortSignal) {
  const [row] = await okxData<{ idxPx: string }>(`market/index-tickers?instId=${pair}`, signal);
  const price = Number(row?.idxPx);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid ${pair} index price`);
  return price;
}
