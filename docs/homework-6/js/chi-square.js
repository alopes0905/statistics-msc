const EPS = 4 * Number.EPSILON;
const TINY = 1e-300;
const MAX_ITERATIONS = 10_000;

/** Shift then use Stirling's expansion through z^-13 (DLMF 5.11), z >= 16. */
export function logGamma(z) {
  if (!Number.isFinite(z) || z < 0.5 || z > 500) throw new RangeError('logGamma supports finite arguments in [0.5, 500].');
  let shift = 0;
  while (z < 16) { shift += Math.log(z); z++; }
  const inv = 1 / z, s = inv * inv;
  const correction = inv * (1 / 12 + s * (-1 / 360 + s * (1 / 1260 + s * (-1 / 1680 + s * (1 / 1188 + s * (-691 / 360360 + s / 156))))));
  return (z - 0.5) * Math.log(z) - z + 0.5 * Math.log(2 * Math.PI) + correction - shift;
}

/** Q(a,x), with log probability retained when exp(logValue) underflows. */
export function regularizedGammaQ(a, x, maxIterations = MAX_ITERATIONS) {
  if (!Number.isFinite(a) || a < 0.5 || a > 500 || !Number.isFinite(x) || x < 0) throw new RangeError('Gamma Q requires 0.5 ≤ a ≤ 500 and finite x ≥ 0.');
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > MAX_ITERATIONS) throw new RangeError('Iteration limit must be 1..10,000.');
  if (x === 0) return { value: 1, logValue: 0, underflow: false };
  // Exact exponential survival for two chi-square degrees of freedom.
  if (a === 1) return probability(-x);
  const logScale = a * Math.log(x) - x - logGamma(a);
  if (x < a + 1) {
    let term = 1 / a, sum = term;
    for (let k = 1; k <= maxIterations; k++) {
      term *= x / (a + k); sum += term;
      if (term <= sum * EPS) {
        const logP = logScale + Math.log(sum);
        if (!Number.isFinite(logP) || logP > 1e-12) throw new RangeError('Invalid lower gamma probability.');
        // In this branch P is not close to one; expm1 also avoids needless cancellation.
        return probability(Math.log(-Math.expm1(Math.min(0, logP))));
      }
    }
  } else {
    // Modified Lentz evaluation of the upper-gamma continued fraction (DLMF 8.9).
    const guard = value => Math.abs(value) < TINY ? (value < 0 ? -TINY : TINY) : value;
    let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
    for (let k = 1; k <= maxIterations; k++) {
      const numerator = k * (a - k);
      b += 2; d = 1 / guard(b + numerator * d); c = guard(b + numerator / c);
      const change = c * d; h *= change;
      if (Math.abs(change - 1) <= EPS) return probability(logScale + Math.log(h));
    }
  }
  throw new RangeError('Incomplete gamma calculation did not converge.');
}

function probability(logValue) {
  if (!Number.isFinite(logValue) || logValue > 1e-12) throw new RangeError('Invalid upper-tail probability.');
  logValue = Math.min(0, logValue); // Only roundoff at the probability boundary.
  const value = Math.exp(logValue);
  return { value, logValue, underflow: value === 0 };
}

// #region chi-square-survival
/** Upper tail, never 1 minus a near-one chi-square CDF. */
export function chiSquareSurvival(statistic, degreesOfFreedom) {
  if (!Number.isFinite(statistic) || statistic < 0) throw new RangeError('Chi-square must be finite and nonnegative.');
  if (!Number.isInteger(degreesOfFreedom) || degreesOfFreedom < 1 || degreesOfFreedom > 1000) throw new RangeError('Degrees of freedom must be an integer in [1, 1000].');
  return regularizedGammaQ(degreesOfFreedom / 2, statistic / 2);
}
// #endregion chi-square-survival
