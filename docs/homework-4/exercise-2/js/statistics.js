import { createWelford, updateWelford, getWelfordStatistics } from '../../shared/welford.js';

export const SCORE_MOMENTS = Object.freeze({ mean: 5, variance: 10, fourthCentralMoment: 178 });

export function validateN(n) {
  if (!Number.isInteger(n) || n < 2 || n > 1000) throw new RangeError('Systems n must be an integer from 2 to 1,000.');
  return n;
}

// #region sampling-theory
/** Exact under the iid discrete-uniform score model; not fitted to the data. */
export function samplingTheory(n, m) {
  validateN(n);
  if (!Number.isInteger(m) || m < 2 || m > 1000) throw new RangeError('Hackers m must be an integer from 2 to 1,000.');
  const varianceOfSampleMeans = 10 / n;
  const varianceOfSampleVariances = (78 + 200 / (n - 1)) / n;
  return {
    expectedSampleMean: 5, expectedSampleVariance: 10,
    varianceOfSampleMeans, varianceOfSampleVariances,
    varianceOfMeanOfMeans: varianceOfSampleMeans / m,
    varianceOfMeanOfVariances: varianceOfSampleVariances / m,
  };
}
// #endregion sampling-theory

function finiteValues(values, minimum = 1) {
  if (!Array.isArray(values) || values.length < minimum || values.length > 1000 ||
      values.some(value => !Number.isFinite(value))) throw new RangeError(`Use ${minimum}..1,000 finite observations.`);
}

// #region across-hacker-statistics
/** Reuse the same recurrence to summarize the two arrays across all m hackers.
 * Their sample variances use m−1, not the within-hacker denominator n−1. */
export function summarizeCheckpoint(n, sampleMeans, sampleVariances) {
  finiteValues(sampleMeans, 2); finiteValues(sampleVariances, 2);
  if (sampleMeans.length !== sampleVariances.length || sampleMeans.some(x => x < 0 || x > 10) ||
      sampleVariances.some(x => x < 0 || x > 50 + 1e-12)) throw new RangeError('Invalid paired hacker estimates.');
  const means = createWelford(), variances = createWelford();
  sampleMeans.forEach(value => updateWelford(means, value));
  sampleVariances.forEach(value => updateWelford(variances, value));
  const meanStatistics = getWelfordStatistics(means), varianceStatistics = getWelfordStatistics(variances);
  return {
    n, m: sampleMeans.length, sampleMeans, sampleVariances,
    meanOfMeans: meanStatistics.mean,
    meanOfVariances: varianceStatistics.mean,
    varianceAcrossMeans: meanStatistics.sampleVariance,
    varianceAcrossVariances: varianceStatistics.sampleVariance,
    theory: samplingTheory(n, sampleMeans.length),
  };
}
// #endregion across-hacker-statistics

/** Equal-width count histogram, with the maximum included in the last bin.
 * Histograms describe the actual estimator arrays, without resampling. */
export function histogram(values, maxBins = 20) {
  finiteValues(values);
  if (!Number.isInteger(maxBins) || maxBins < 2 || maxBins > 50) throw new RangeError('Use 2..50 histogram bins.');
  const minimum = Math.min(...values), maximum = Math.max(...values);
  const count = minimum === maximum ? 1 : maxBins;
  const left = minimum === maximum ? minimum - 0.5 : minimum;
  const width = minimum === maximum ? 1 : (maximum - minimum) / count;
  if (!Number.isFinite(width) || width <= 0) throw new RangeError('Histogram range exceeds floating-point precision.');
  const bins = Array.from({ length: count }, (_, i) => ({ left: left + i * width, right: left + (i + 1) * width, count: 0 }));
  for (const value of values) {
    const index = Math.max(0, Math.min(count - 1, Math.floor((value - left) / width)));
    bins[index].count += 1;
  }
  return { bins, sampleSize: values.length, left, right: bins.at(-1).right };
}
