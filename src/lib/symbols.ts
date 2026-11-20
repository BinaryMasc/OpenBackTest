/**
 * Broker symbols may carry an exchange suffix (e.g. "NQZ5.CME") while the
 * chart uses the bare contract. Treat both spellings as the same instrument.
 */
export function sameSymbol(left: string, right: string): boolean {
  const normalizedLeft = left.trim().toUpperCase();
  const normalizedRight = right.trim().toUpperCase();
  return normalizedLeft === normalizedRight
    || normalizedLeft.split('.')[0] === normalizedRight.split('.')[0];
}

/** Storage key for per-symbol state; empty symbols share a default bucket. */
export function getSymbolKey(symbol: string): string {
  return symbol.trim().toUpperCase() || '__default__';
}
