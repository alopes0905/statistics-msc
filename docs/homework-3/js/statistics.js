export const METRICS = Object.freeze(['total', 'average', 'normalized']);

export function validateN(n) {
  if (!Number.isInteger(n) || n < 1 || n > 2000) throw new RangeError('System count n must be an integer from 1 to 2,000.');
  return n;
}

export function incrementMoments(model, p) {
  if (!['bernoulli', 'rademacher'].includes(model)) throw new RangeError('Choose Bernoulli or Rademacher increments.');
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError('Bernoulli probability p must be between 0 and 1.');
  return model === 'bernoulli' ? { mu: p, sigma2: p * (1 - p) } : { mu: 0, sigma2: 1 };
}

export function theoreticalMoments(model, p, n) {
  validateN(n);
  const { mu, sigma2 } = incrementMoments(model, p);
  return {
    total: { mean: n * mu, variance: n * sigma2 },
    average: { mean: mu, variance: sigma2 / n },
    normalized: { mean: mu * Math.sqrt(n), variance: sigma2 },
  };
}

function finiteSample(values, minimum = 1) {
  if (!Array.isArray(values) || values.length < minimum || values.length > 1000 || values.some(x => !Number.isFinite(x))) {
    throw new RangeError(`Use ${minimum}..1,000 finite sample values.`);
  }
}

// #region empirical-moments
/** One total supplies all three metrics. n is positive; nothing is rounded. */
export function scoreValues(total, n) {
  validateN(n);
  if (!Number.isFinite(total)) throw new TypeError('The score must be finite.');
  return { total, average: total / n, normalized: total / Math.sqrt(n) };
}

/** Welford's algorithm; unbiased sample variance uses m−1, not m. */
export function sampleMoments(values) {
  finiteSample(values, 2);
  let mean = 0, sumSquares = 0;
  values.forEach((value, index) => {
    const delta = value - mean;
    mean += delta / (index + 1);
    sumSquares += delta * (value - mean);
  });
  const variance = Math.max(0, sumSquares / (values.length - 1));
  if (!Number.isFinite(mean) || !Number.isFinite(variance)) throw new RangeError('Sample moments exceed finite numerical precision.');
  return { mean, variance };
}
// #endregion empirical-moments

// #region lln-deviations
/** Strict > ε. A few ulps protect decimal boundary equalities from roundoff. */
export function deviationProbability(averages, target, epsilon) {
  finiteSample(averages);
  if (!Number.isFinite(target) || !Number.isFinite(epsilon) || epsilon <= 0) throw new RangeError('Use a finite target and positive epsilon.');
  const outside = averages.filter(value => {
    const tolerance = 8 * Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(target), epsilon);
    return Math.abs(value - target) > epsilon + tolerance;
  }).length;
  return { outside, probability: outside / averages.length };
}

/** Exact theoretical upper bound, capped at one; not an empirical estimate. */
export function chebyshevBound(sigma2, n, epsilon) {
  validateN(n);
  if (!Number.isFinite(sigma2) || sigma2 < 0 || !Number.isFinite(epsilon) || epsilon <= 0) throw new RangeError('Use nonnegative variance and positive epsilon.');
  if (sigma2 === 0) return 0;
  return Math.min(1, sigma2 / n / epsilon ** 2);
}
// #endregion lln-deviations

export function summarizeScores(totals, n, model, p, epsilon) {
  finiteSample(totals, 2);
  const theory = theoreticalMoments(model, p, n);
  const { mu, sigma2 } = incrementMoments(model, p);
  const transformed = totals.map(total => scoreValues(total, n));
  const metrics = Object.fromEntries(METRICS.map(metric => {
    const values = transformed.map(row => row[metric]);
    return [metric, { values, empirical: sampleMoments(values), theoretical: theory[metric] }];
  }));
  return { n, metrics,
    lln: { ...deviationProbability(metrics.average.values, mu, epsilon), bound: chebyshevBound(sigma2, n, epsilon) },
    aggregate: { observed: totals.reduce((sum, x) => sum + x, 0), mean: totals.length * n * mu, variance: totals.length * n * sigma2 },
  };
}

/** Equal-width, lattice-aligned bins. Heights are counts/(m × bin width).
 * Integer total-score indices avoid floating-point bin-boundary mistakes. */
export function scoreHistogram(totals, n, model, metric, maxBins = 24) {
  finiteSample(totals);
  validateN(n);
  incrementMoments(model, 0.5);
  if (!METRICS.includes(metric) || !Number.isInteger(maxBins) || maxBins < 2 || maxBins > 100) throw new RangeError('Invalid histogram metric or bin count.');
  const step = model === 'rademacher' ? 2 : 1, origin = model === 'rademacher' ? -n : 0;
  if (totals.some(x => !Number.isInteger(x) || x < origin || x > n || (x - origin) % step !== 0)) throw new RangeError('Scores violate the model’s integer lattice support.');
  const indices = totals.map(x => (x - origin) / step);
  const first = Math.min(...indices), last = Math.max(...indices);
  const group = Math.max(1, Math.ceil((last - first + 1) / maxBins));
  const count = Math.ceil((last - first + 1) / group);
  const factor = metric === 'total' ? 1 : metric === 'average' ? 1 / n : 1 / Math.sqrt(n);
  const width = group * step * factor;
  const left = (origin + (first - 0.5) * step) * factor;
  const bins = Array.from({ length: count }, (_, i) => ({ left: left + i * width, right: left + (i + 1) * width, count: 0, density: 0 }));
  indices.forEach(index => { bins[Math.floor((index - first) / group)].count += 1; });
  bins.forEach(bin => { bin.density = bin.count / (totals.length * width); });
  return { bins, width, sampleSize: totals.length, left, right: left + count * width };
}

export function normalPDF(x) {
  if (typeof x !== 'number' || Number.isNaN(x)) throw new TypeError('Expected a number.');
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Abramowitz–Stegun 26.2.17: absolute error below 7.5e−8; not an exact CDF. */
export function normalCDF(x) {
  if (typeof x !== 'number' || Number.isNaN(x)) throw new TypeError('Expected a number.');
  if (x === 0) return 0.5;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const tail = normalPDF(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x < 0 ? tail : 1 - tail;
}

// #region clt-comparison
/** Descriptive sup |empirical CDF − Φ|, checking both sides of every jump.
 * Ties/lattice points are retained. No hypothesis-test p-value is computed. */
export function normalDistance(values) {
  finiteSample(values);
  const ordered = [...values].sort((a, b) => a - b);
  return ordered.reduce((distance, value, i) => Math.max(distance,
    Math.abs(i / ordered.length - normalCDF(value)),
    Math.abs((i + 1) / ordered.length - normalCDF(value))), 0);
}

export function cltComparison(snapshot, model) {
  if (model !== 'rademacher') throw new RangeError('The uncentered standard-normal comparison requires Rademacher increments.');
  return { n: snapshot.n, ...sampleMoments(snapshot.metrics.normalized.values),
    distance: normalDistance(snapshot.metrics.normalized.values), theoreticalMean: 0, theoreticalVariance: 1 };
}
// #endregion clt-comparison
