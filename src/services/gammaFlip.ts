export interface GammaOption {
  strike: number;
  signedSize: number;
  volatility: number;
}

/** Nearest sign change in the nearest expiry's fixed-IV, zero-carry Black-Scholes profile. */
export function findGammaFlip(options: GammaOption[], spot: number, years: number): number | undefined {
  if (years <= 0 || !options.some(o => o.signedSize > 0) || !options.some(o => o.signedSize < 0)) return;
  if (options.some(o => !Number.isFinite(o.volatility) || o.volatility <= 0)) return;
  const terms = options.map(({ strike, signedSize, volatility }) => {
    const deviation = volatility * Math.sqrt(years);
    return {
      logStrike: Math.log(strike), deviation, sign: Math.sign(signedSize),
      logWeight: Math.log(Math.abs(signedSize) / deviation),
    };
  });

  // Gamma is proportional to exp(-d1²/2) / deviation. The remaining spot and
  // dollar-GEX factors are positive and common to the chain, so omit them.
  function gammaSign(price: number) {
    const logSpot = Math.log(price);
    const weights = terms.map(({ logStrike, deviation, logWeight }) => {
      const d1 = (logSpot - logStrike) / deviation + deviation / 2;
      return logWeight - d1 * d1 / 2;
    });
    // Scale before exponentiation so deep OTM legs near expiry don't all round to zero.
    const largest = Math.max(...weights);
    let net = 0;
    let gross = 0;
    for (let i = 0; i < terms.length; i++) {
      const weight = Math.exp(weights[i] - largest);
      net += terms[i].sign * weight;
      gross += weight;
    }
    return Math.abs(net) <= gross * 1e-12 ? 0 : Math.sign(net);
  }

  // Include strikes to sample narrow near-expiry peaks between regular grid points.
  const prices = new Set(Array.from({ length: 161 }, (_, i) => spot * (0.8 + i / 400)));
  for (const { strike } of options) {
    if (strike > spot * 0.8 && strike < spot * 1.2) prices.add(strike);
  }
  let previousPrice = 0;
  let previousSign = 0;
  let nearest: number | undefined;
  for (const price of [...prices].sort((a, b) => a - b)) {
    const sign = gammaSign(price);
    if (!sign) continue;
    if (previousSign && sign !== previousSign) {
      let low = previousPrice;
      let high = price;
      for (let i = 0; i < 40 && high - low > 0.0001; i++) {
        const mid = (low + high) / 2;
        const midSign = gammaSign(mid);
        if (!midSign) {
          low = mid;
          high = mid;
          break;
        }
        if (midSign === previousSign) low = mid;
        else high = mid;
      }
      const crossing = (low + high) / 2;
      if (nearest === undefined || Math.abs(crossing - spot) < Math.abs(nearest - spot)) nearest = crossing;
    }
    previousPrice = price;
    previousSign = sign;
  }
  return nearest;
}
