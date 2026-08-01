export type DrawingAnalyticsBar = {
  time: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type RegressionChannel = {
  sampleCount: number;
  startTime: string;
  endTime: string;
  start: number;
  end: number;
  upperStart: number;
  upperEnd: number;
  lowerStart: number;
  lowerEnd: number;
  slope: number;
  standardDeviation: number;
  pearsonR: number;
};

export type AnchoredVwapPoint = {
  time: string;
  vwap: number;
  standardDeviation: number;
  upper: readonly [number, number, number];
  lower: readonly [number, number, number];
};

export type VolumeProfileBin = {
  low: number;
  high: number;
  midpoint: number;
  volume: number;
  isPoc: boolean;
  inValueArea: boolean;
};

export type FixedRangeVolumeProfile = {
  bins: VolumeProfileBin[];
  totalVolume: number;
  pocIndex: number;
  pocPrice: number;
  valueAreaLowIndex: number;
  valueAreaHighIndex: number;
  valueAreaLow: number;
  valueAreaHigh: number;
};

export type GhostFeedCandle = {
  progress: number;
  o: number;
  h: number;
  l: number;
  c: number;
};

export type GhostFeed = {
  candles: GhostFeedCandle[];
  volatility: number;
  seed: number;
};

const finite = (value: number) => Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Least-squares close-price regression over a selected run of chart bars.
 * Bands use the population standard deviation of the residuals, matching the
 * visual question a regression channel answers: how far price dispersed from
 * its fitted path over this exact selection.
 */
export function calculateRegressionChannel(
  bars: readonly DrawingAnalyticsBar[],
  deviationMultiplier = 2,
): RegressionChannel | null {
  const samples = bars.flatMap((bar, index) => finite(bar.c)
    ? [{ x: index, y: bar.c, time: String(bar.time) }]
    : []);
  if (samples.length < 2) return null;

  const meanX = samples.reduce((sum, sample) => sum + sample.x, 0) / samples.length;
  const meanY = samples.reduce((sum, sample) => sum + sample.y, 0) / samples.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const sample of samples) {
    const dx = sample.x - meanX;
    const dy = sample.y - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (!(sxx > 0)) return null;

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const prediction = (x: number) => intercept + slope * x;
  const residualVariance = samples.reduce((sum, sample) => {
    const residual = sample.y - prediction(sample.x);
    return sum + residual * residual;
  }, 0) / samples.length;
  const standardDeviation = Math.sqrt(Math.max(0, residualVariance));
  const band = standardDeviation * Math.max(0, finite(deviationMultiplier) ? deviationMultiplier : 2);
  const first = samples[0];
  const last = samples[samples.length - 1];
  const start = prediction(first.x);
  const end = prediction(last.x);
  const pearsonR = syy > 0 ? clamp(sxy / Math.sqrt(sxx * syy), -1, 1) : 0;

  return {
    sampleCount: samples.length,
    startTime: first.time,
    endTime: last.time,
    start,
    end,
    upperStart: start + band,
    upperEnd: end + band,
    lowerStart: start - band,
    lowerEnd: end - band,
    slope,
    standardDeviation,
    pearsonR,
  };
}

/**
 * Cumulative anchored VWAP with online, volume-weighted population variance.
 * Zero-volume bars carry the established value forward; they never receive an
 * invented unit weight.
 */
export function calculateAnchoredVwap(bars: readonly DrawingAnalyticsBar[]): AnchoredVwapPoint[] {
  const result: AnchoredVwapPoint[] = [];
  let totalWeight = 0;
  let mean = 0;
  let weightedM2 = 0;

  for (const bar of bars) {
    if (!finite(bar.h) || !finite(bar.l) || !finite(bar.c)) continue;
    const typicalPrice = (bar.h + bar.l + bar.c) / 3;
    const weight = finite(bar.v) && bar.v > 0 ? bar.v : 0;
    if (weight > 0) {
      const nextWeight = totalWeight + weight;
      const delta = typicalPrice - mean;
      const nextMean = mean + delta * weight / nextWeight;
      weightedM2 += weight * delta * (typicalPrice - nextMean);
      mean = nextMean;
      totalWeight = nextWeight;
    }
    if (!(totalWeight > 0)) continue;
    const standardDeviation = Math.sqrt(Math.max(0, weightedM2 / totalWeight));
    result.push({
      time: String(bar.time),
      vwap: mean,
      standardDeviation,
      upper: [mean + standardDeviation, mean + 2 * standardDeviation, mean + 3 * standardDeviation],
      lower: [mean - standardDeviation, mean - 2 * standardDeviation, mean - 3 * standardDeviation],
    });
  }
  return result;
}

/**
 * Volume-by-price profile using candle-range overlap rather than assigning a
 * bar's entire volume to one typical-price bucket. Value area grows outward
 * from POC toward the larger adjacent bucket until it contains the requested
 * fraction of represented volume.
 */
export function calculateFixedRangeVolumeProfile(
  bars: readonly DrawingAnalyticsBar[],
  rangeLow: number,
  rangeHigh: number,
  binCount = 24,
  valueAreaFraction = 0.7,
): FixedRangeVolumeProfile | null {
  if (!finite(rangeLow) || !finite(rangeHigh) || rangeLow === rangeHigh) return null;
  const low = Math.min(rangeLow, rangeHigh);
  const high = Math.max(rangeLow, rangeHigh);
  const count = clamp(finite(binCount) ? Math.trunc(binCount) : 24, 4, 200);
  const binSize = (high - low) / count;
  if (!(binSize > 0) || !finite(binSize)) return null;
  const volumes = Array<number>(count).fill(0);

  for (const bar of bars) {
    const volume = finite(bar.v) && bar.v > 0 ? bar.v : 0;
    if (!(volume > 0) || !finite(bar.h) || !finite(bar.l)) continue;
    const barLow = Math.min(bar.l, bar.h);
    const barHigh = Math.max(bar.l, bar.h);
    if (barHigh < low || barLow > high) continue;

    const barRange = barHigh - barLow;
    if (!(barRange > 0)) {
      const index = clamp(Math.floor((barLow - low) / binSize), 0, count - 1);
      volumes[index] += volume;
      continue;
    }

    const overlapLow = Math.max(low, barLow);
    const overlapHigh = Math.min(high, barHigh);
    if (!(overlapHigh > overlapLow)) continue;
    const firstBin = clamp(Math.floor((overlapLow - low) / binSize), 0, count - 1);
    // `ceil(...)-1` assigns an exact upper boundary to the bin below it without
    // relying on an epsilon that disappears at normal market-price magnitudes.
    const lastBin = clamp(Math.ceil((overlapHigh - low) / binSize) - 1, 0, count - 1);
    for (let index = firstBin; index <= lastBin; index += 1) {
      const binLow = low + index * binSize;
      const binHigh = index === count - 1 ? high : binLow + binSize;
      const overlap = Math.max(0, Math.min(barHigh, binHigh) - Math.max(barLow, binLow));
      if (overlap > 0) volumes[index] += volume * overlap / barRange;
    }
  }

  const totalVolume = volumes.reduce((sum, volume) => sum + volume, 0);
  if (!(totalVolume > 0) || !finite(totalVolume)) return null;
  let pocIndex = 0;
  for (let index = 1; index < volumes.length; index += 1) {
    if (volumes[index] > volumes[pocIndex]) pocIndex = index;
  }

  const target = totalVolume * clamp(finite(valueAreaFraction) ? valueAreaFraction : 0.7, 0.01, 1);
  let valueAreaLowIndex = pocIndex;
  let valueAreaHighIndex = pocIndex;
  let captured = volumes[pocIndex];
  while (captured < target && (valueAreaLowIndex > 0 || valueAreaHighIndex < count - 1)) {
    const below = valueAreaLowIndex > 0 ? volumes[valueAreaLowIndex - 1] : -1;
    const above = valueAreaHighIndex < count - 1 ? volumes[valueAreaHighIndex + 1] : -1;
    if (below >= above && valueAreaLowIndex > 0) {
      valueAreaLowIndex -= 1;
      captured += volumes[valueAreaLowIndex];
    } else if (valueAreaHighIndex < count - 1) {
      valueAreaHighIndex += 1;
      captured += volumes[valueAreaHighIndex];
    } else {
      break;
    }
  }

  const bins = volumes.map((volume, index): VolumeProfileBin => {
    const binLow = low + index * binSize;
    const binHigh = index === count - 1 ? high : binLow + binSize;
    return {
      low: binLow,
      high: binHigh,
      midpoint: (binLow + binHigh) / 2,
      volume,
      isPoc: index === pocIndex,
      inValueArea: index >= valueAreaLowIndex && index <= valueAreaHighIndex,
    };
  });

  return {
    bins,
    totalVolume,
    pocIndex,
    pocPrice: bins[pocIndex].midpoint,
    valueAreaLowIndex,
    valueAreaHighIndex,
    valueAreaLow: bins[valueAreaLowIndex].low,
    valueAreaHigh: bins[valueAreaHighIndex].high,
  };
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function baselineAt(prices: readonly number[], progress: number): number {
  if (prices.length === 1) return prices[0];
  const scaled = clamp(progress, 0, 1) * (prices.length - 1);
  const index = Math.min(prices.length - 2, Math.floor(scaled));
  const local = scaled - index;
  return prices[index] + (prices[index + 1] - prices[index]) * local;
}

/**
 * Deterministic scenario candles that follow the user's control path while
 * inheriting their noise and wick scale from recent realised volatility.
 */
export function generateGhostFeed(
  recentBars: readonly DrawingAnalyticsBar[],
  controlPrices: readonly number[],
  candleCount: number,
): GhostFeed | null {
  const prices = controlPrices.filter(finite);
  if (prices.length < 2) return null;
  const history = recentBars.filter((bar) => finite(bar.c) && finite(bar.h) && finite(bar.l));
  const count = clamp(finite(candleCount) ? Math.trunc(candleCount) : 24, 4, 64);

  const logReturns: number[] = [];
  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1].c;
    const current = history[index].c;
    if (previous > 0 && current > 0) logReturns.push(Math.log(current / previous));
  }
  const returnMean = logReturns.length
    ? logReturns.reduce((sum, value) => sum + value, 0) / logReturns.length
    : 0;
  const returnStdDev = logReturns.length
    ? Math.sqrt(logReturns.reduce((sum, value) => sum + (value - returnMean) ** 2, 0) / logReturns.length)
    : 0;
  const averageRangePct = history.length
    ? history.reduce((sum, bar) => sum + Math.abs(bar.h - bar.l) / Math.max(Math.abs(bar.c), 1e-9), 0) / history.length
    : 0;
  const volatilityPct = clamp(Math.max(returnStdDev, averageRangePct * 0.45, 0.0015), 0.0015, 0.15);
  const referencePrice = Math.max(1e-9, Math.abs(prices.reduce((sum, price) => sum + price, 0) / prices.length));
  const volatility = referencePrice * volatilityPct;
  const signatureNumber = (value: number) => finite(value) ? value.toPrecision(10) : "0";
  const signature = [
    ...history.slice(-64).map((bar) => `${bar.time}:${signatureNumber(bar.o)}:${signatureNumber(bar.h)}:${signatureNumber(bar.l)}:${signatureNumber(bar.c)}:${signatureNumber(bar.v)}`),
    `path:${prices.map((price) => price.toPrecision(12)).join(",")}`,
    `count:${count}`,
  ].join("|");
  const seed = hashString(signature) || 0x9e3779b9;
  const random = seededRandom(seed);
  const candles: GhostFeedCandle[] = [];
  let previousClose = prices[0];
  let persistentNoise = 0;

  for (let index = 0; index < count; index += 1) {
    const progress = count === 1 ? 1 : index / (count - 1);
    const baseline = baselineAt(prices, progress);
    const innovation = (random() + random() + random() - 1.5) * 1.25;
    persistentNoise = persistentNoise * 0.42 + innovation * volatility * 0.58;
    const envelope = Math.sin(Math.PI * progress);
    const close = baseline + persistentNoise * envelope;
    const open = index === 0 ? prices[0] : previousClose;
    const wickScale = volatility * (0.22 + random() * 0.58);
    const high = Math.max(open, close) + wickScale * (0.45 + random() * 0.55);
    const low = Math.min(open, close) - wickScale * (0.45 + random() * 0.55);
    candles.push({ progress, o: open, h: high, l: low, c: close });
    previousClose = close;
  }

  return { candles, volatility, seed };
}
