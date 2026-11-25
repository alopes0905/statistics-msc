export const CHECKPOINTS = Object.freeze([10, 20, 50, 100, 200, 500, 1000]);
export const DEFAULTS = Object.freeze({ model: 'bernoulli', p: 0.35, m: 1000, maxN: 1000, seed: 2026, epsilon: 0.1 });
const MODULUS = 2147483647;
const MULTIPLIER = 16807;
const BLOCK_SIZE = 1000;

export function modelMoments(model, p) {
  if (model === 'rademacher') return { mean: 0, variance: 1 };
  if (model !== 'bernoulli') throw new RangeError('Choose Bernoulli or Rademacher.');
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError('Bernoulli p must be between 0 and 1.');
  return { mean: p, variance: p * (1 - p) };
}

function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer from ${min} to ${max}.`);
  }
}

// #region mean-and-scaling
export function sampleMeanTheory(model, p, n, epsilon) {
  integer(n, 1, BLOCK_SIZE, 'Sample size n');
  if (!Number.isFinite(epsilon) || epsilon < 0.001 || epsilon > 2) {
    throw new RangeError('Tolerance ε must be between 0.001 and 2.');
  }
  const { mean, variance } = modelMoments(model, p);
  const meanVariance = variance / n;
  return {
    mean, variance: meanVariance, mse: meanVariance,
    chebyshev: Math.min(1, meanVariance / epsilon ** 2),
    normalizedVariance: variance > 0 ? 1 : null
  };
}

export function standardizedMean(mean, n, moments) {
  return moments.variance === 0 ? null : Math.sqrt(n) * (mean - moments.mean) / Math.sqrt(moments.variance);
}

/** Analytical comparison at marginal variance σ² = 1. */
export function dependenceScaling(n, rho) {
  integer(n, 1, Number.MAX_SAFE_INTEGER, 'Sample size n');
  if (!Number.isFinite(rho) || rho < 0 || rho > 1) {
    throw new RangeError('Correlation ρ must be between 0 and 1.');
  }
  const independentVariance = 1 / n;
  const correlatedVariance = n === 1 ? 1 : rho + (1 - rho) / n;
  return {
    independentVariance, correlatedVariance,
    independentSD: Math.sqrt(independentVariance),
    correlatedSD: Math.sqrt(correlatedVariance),
    limitingVariance: rho,
    normalizedVariance: 1 + (n - 1) * rho
  };
}
// #endregion mean-and-scaling

export function spike(n) {
  integer(n, 1, Number.MAX_SAFE_INTEGER, 'Index n');
  return { height: Math.sqrt(n), probability: 1 / n, secondMoment: 1 };
}

export function typewriterInterval(n) {
  integer(n, 1, Number.MAX_SAFE_INTEGER, 'Index n');
  const power = 2 ** Math.floor(Math.log2(n));
  const size = power > n ? power / 2 : power;
  const j = n - size;
  return { left: j / size, right: (j + 1) / size, secondMoment: 1 / size };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values, mean) {
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
}

function decimalRatio(value) {
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponent);
  const digits = BigInt(whole + fraction);
  return scale < 0 ? [digits * 10n ** BigInt(-scale), 1n] : [digits, 10n ** BigInt(scale)];
}

// Compare the integer sample sums to n(μ ± ε) in exact decimal arithmetic.
function deviationFraction(sums, n, mean, epsilon) {
  const [meanNumerator, meanDenominator] = decimalRatio(mean);
  const [epsNumerator, epsDenominator] = decimalRatio(epsilon);
  const denominator = meanDenominator * epsDenominator;
  const center = BigInt(n) * meanNumerator * epsDenominator;
  const radius = BigInt(n) * epsNumerator * meanDenominator;
  let count = 0;
  for (const sum of sums) {
    const error = BigInt(sum) * denominator - center;
    if (error <= -radius || error >= radius) count++;
  }
  return count / sums.length;
}

export function summarize(sums, n, config) {
  if (sums.length < 2 || !sums.every(Number.isSafeInteger)) throw new RangeError('At least two integer sample sums are required.');
  const theory = sampleMeanTheory(config.model, config.p, n, config.epsilon);
  const moments = modelMoments(config.model, config.p);
  const means = sums.map(sum => sum / n);
  const mean = average(means);
  const z = moments.variance === 0 ? null : means.map(value => standardizedMean(value, n, moments));
  const zMean = z === null ? null : average(z);
  return {
    n, theory, mean, variance: sampleVariance(means, mean),
    mse: average(means.map(value => (value - theory.mean) ** 2)),
    deviation: deviationFraction(sums, n, theory.mean, config.epsilon),
    z, zMean, zVariance: z === null ? null : sampleVariance(z, zMean)
  };
}

/** Multiply by this stride to reserve fixed, disjoint blocks in one full-period stream. */
function blockStride() {
  let state = 1;
  for (let i = 0; i < BLOCK_SIZE; i++) state = MULTIPLIER * state % MODULUS;
  return BigInt(state);
}

const stride = blockStride();

// #region shared-prefixes
export function simulate(config = DEFAULTS) {
  const { model, p, m, maxN, seed, epsilon } = config;
  const moments = modelMoments(model, p);
  integer(m, 2, 2000, 'Trajectory count m');
  integer(seed, 1, MODULUS - 1, 'Seed');
  if (!CHECKPOINTS.includes(maxN)) throw new RangeError('Choose a maximum n from the available checkpoints.');
  sampleMeanTheory(model, p, maxN, epsilon);
  const checkpoints = CHECKPOINTS.filter(n => n <= maxN);
  const sums = checkpoints.map(() => []);
  let blockStart = seed;
  for (let path = 0; path < m; path++) {
    let state = blockStart;
    let sum = 0;
    let checkpoint = 0;
    for (let n = 1; n <= maxN; n++) {
      state = MULTIPLIER * state % MODULUS;
      const uniform = (state - 1) / (MODULUS - 1);
      sum += model === 'bernoulli' ? Number(uniform < p) : (uniform < 0.5 ? 1 : -1);
      if (n === checkpoints[checkpoint]) {
        sums[checkpoint].push(sum);
        checkpoint++;
      }
    }
    blockStart = Number(BigInt(blockStart) * stride % BigInt(MODULUS));
  }
  const snapshots = sums.map((row, i) => summarize(row, checkpoints[i], config));
  return {
    moments, checkpoints, m, paths: Array.from({ length: Math.min(m, 6) }, (_, path) => sums.map((row, i) => row[path] / checkpoints[i])),
    snapshots,
    bound: Math.max(4, ...snapshots.flatMap(({ z }) => (z ?? []).map(value => Math.ceil(Math.abs(value)))))
  };
}
// #endregion shared-prefixes

/** Equal-width bins on a symmetric range. The rightmost bin includes its right endpoint. */
export function histogram(values, bound, count = 24) {
  integer(count, 1, 100, 'Bin count');
  if (!(bound > 0) || !Number.isFinite(2 * bound) || !values.length || !values.every(x => Number.isFinite(x) && Math.abs(x) <= bound)) {
    throw new RangeError('Histogram values must lie within the finite plot range.');
  }
  const width = 2 * bound / count;
  const counts = Array(count).fill(0);
  for (const value of values) counts[Math.min(count - 1, Math.floor((value + bound) / width))]++;
  return counts.map((frequency, i) => ({
    left: -bound + i * width, right: -bound + (i + 1) * width,
    frequency, density: frequency / values.length / width
  }));
}
