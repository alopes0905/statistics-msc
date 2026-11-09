import { integer } from '../../shared/numerics.js';

export const MAX_PARTITIONS = 4096;
export const PARTITIONS = Object.freeze([8, 16, 32, 64, 128, 256, 512, 1024]);

function sinc(x) {
  if (x === 0) return 1;
  if (x === Math.PI) return 0;
  if (Math.abs(x) < 0.01) return 1 + x*x*(-1/6 + x*x*(1/120 - x*x/5040));
  return Math.sin(x) / x;
}

// #region sinc-preimage
/** On [0,π], sinc is strictly decreasing. Its superlevel set is [0,r).
 * Bisection counts every function call and retains the root bracket.
 * The bracket is numerical, not an interval-arithmetic proof for Math.sin. */
export function sincPreimage(t, tolerance = 1e-12, maxIterations = 64) {
  if (!Number.isFinite(t) || !Number.isFinite(tolerance) || tolerance < 1e-14 || tolerance > 1e-4) throw new RangeError('Use a finite level and root tolerance 1e−14..1e−4.');
  integer(maxIterations, 1, 100, 'Bisection limit');
  if (t <= 0) return { value: Math.PI, lower: Math.PI, upper: Math.PI, intervals: [[0, Math.PI]], fEvaluations: 0, rootIterations: 0 };
  if (t >= 1) return { value: 0, lower: 0, upper: 0, intervals: [], fEvaluations: 0, rootIterations: 0 };
  let lower = 0, upper = Math.PI, iterations = 0;
  while (upper - lower > tolerance && iterations < maxIterations) {
    const middle = (lower + upper) / 2;
    if (sinc(middle) > t) lower = middle; else upper = middle;
    iterations += 1;
  }
  if (upper - lower > tolerance) throw new Error('Sinc inversion did not reach the requested root tolerance.');
  const value = (lower + upper) / 2;
  return { value, lower, upper, intervals: [[0, value]], fEvaluations: iterations, rootIterations: iterations };
}
// #endregion sinc-preimage

function definition(data) {
  const [a, b] = data.domain;
  return Object.freeze({ ...data, domain: Object.freeze(data.domain),
    evaluate(x) {
      if (!Number.isFinite(x) || x < a || x > b || (data.improper && x === a)) throw new RangeError('Evaluation is outside the function’s domain.');
      const value = data.evaluator(x);
      if (!Number.isFinite(value) || value < 0) throw new RangeError('Function evaluation must be finite and nonnegative.');
      return value;
    },
    measure(t) {
      if (!Number.isFinite(t)) throw new TypeError('The superlevel threshold must be finite.');
      if (data.id === 'sinc') return sincPreimage(t);
      const intervals = data.preimages(t);
      const value = intervals.reduce((length, [left, right]) => length + right - left, 0);
      return { value, lower: value, upper: value, intervals, fEvaluations: 0, rootIterations: 0 };
    },
  });
}

// #region analytic-preimages
/** These are lengths of solved superlevel sets, not frequencies of samples.
 * Single endpoints have measure zero; strict inequalities do matter at jumps. */
export const FUNCTIONS = Object.freeze([
  definition({ id: 'quadratic', name: 'Quadratic · x²', domain: [0,1], formula: 'x²', height: 1, reference: 1/3,
    measureFormula: 'M(t) = 1−√t, 0 ≤ t < 1', classification: 'Continuous; Riemann and Lebesgue integrable.',
    limitations: 'The square-root corner in M reduces value-axis midpoint convergence.', evaluator: x => x*x,
    preimages: t => t < 0 ? [[0,1]] : t < 1 ? [[Math.sqrt(t),1]] : [] }),
  definition({ id: 'sine', name: 'Sine · sin(x)', domain: [0,Math.PI], formula: 'sin(x)', height: 1, reference: 2,
    measureFormula: 'M(t) = π−2 arcsin(t), 0 ≤ t < 1', classification: 'Continuous; Riemann and Lebesgue integrable.',
    limitations: 'The inverse-sine corner affects value-axis accuracy.', evaluator: x => x === 0 || x === Math.PI ? 0 : Math.sin(x),
    preimages: t => t < 0 ? [[0,Math.PI]] : t < 1 ? [[Math.asin(t),Math.PI-Math.asin(t)]] : [] }),
  definition({ id: 'step', name: 'Step · 1 then 3', domain: [0,1], formula: '1 if x<½; 3 otherwise', height: 3, reference: 2,
    measureFormula: 'M(t) = 1 for t<1; ½ for 1≤t<3; 0 for t≥3 (t≥0)', classification: 'One discontinuity; Riemann and Lebesgue integrable.',
    limitations: 'Error depends on whether domain and range bins align with the jump.', evaluator: x => x < 0.5 ? 1 : 3,
    preimages: t => t < 1 ? [[0,1]] : t < 3 ? [[0.5,1]] : [] }),
  definition({ id: 'absolute', name: 'Absolute value · |x−½|', domain: [0,1], formula: '|x−½|', height: 0.5, reference: 0.25,
    measureFormula: 'M(t) = 1−2t, 0 ≤ t < ½', classification: 'Continuous; Riemann and Lebesgue integrable.',
    limitations: 'Aligned even domain partitions integrate each linear piece exactly.', evaluator: x => Math.abs(x-0.5),
    preimages: t => t < 0 ? [[0,1]] : t < 0.5 ? [[0,0.5-t],[0.5+t,1]] : [] }),
  definition({ id: 'indicator', name: 'Indicator · 1 on [0,½)', domain: [0,1], formula: '1 if x<½; 0 otherwise', height: 1, reference: 0.5,
    measureFormula: 'M(t) = ½ for 0≤t<1; 0 for t≥1', classification: 'One discontinuity; Riemann and Lebesgue integrable.',
    limitations: 'Changing the value at x=½ changes no integral.', evaluator: x => x < 0.5 ? 1 : 0,
    preimages: t => t < 0 ? [[0,1]] : t < 1 ? [[0,0.5]] : [] }),
  definition({ id: 'singular', name: 'Improper · 1/√x', domain: [0,1], formula: '1/√x on (0,1]', height: null, reference: 2, improper: true,
    measureFormula: 'M(t) = 1 for 0≤t≤1; 1/t² for t>1', classification: 'Unbounded: improper Riemann and Lebesgue integrals exist; no proper Riemann integral on [0,1].',
    limitations: 'Midpoints never evaluate zero. A value cutoff T omits an exact tail 1/T.', evaluator: x => 1/Math.sqrt(x),
    preimages: t => t <= 1 ? [[0,1]] : [[0,1/(t*t)]] }),
  definition({ id: 'sinc', name: 'Sinc · sin(x)/x', domain: [0,Math.PI], formula: 'sin(x)/x; f(0)=1', height: 1, reference: 1.8519370519824662,
    measureFormula: 'M(t) = r where sin(r)/r=t, for 0<t<1', classification: 'Continuous extension; Riemann and Lebesgue integrable.',
    limitations: 'Level-set inversion adds ~42 function calls per interior threshold; root brackets use ordinary floating-point arithmetic.', evaluator: sinc }),
]);
// #endregion analytic-preimages

export function getFunction(id) {
  const result = FUNCTIONS.find(f => f.id === id);
  if (!result) throw new RangeError('Choose a supported integration function.');
  return result;
}

export function gcd(a, b) {
  integer(a, 0, 1000000000, 'Numerator'); integer(b, 1, 1000000000, 'Denominator');
  while (b !== 0) { const remainder = a % b; a = b; b = remainder; }
  return a;
}

export function thomaeRational(p, q) {
  integer(p, 0, q, 'Rational numerator'); integer(q, 1, 1000000, 'Rational denominator');
  return gcd(p,q) / q;
}

// #region pathological-samples
/** Exact rational indices and symbolic irrational tags, never an isRational(x).
 * (i+√2/2)/K is irrational and strictly inside the i-th subinterval. */
export function pathologicalSamples(K) {
  integer(K, 1, MAX_PARTITIONS, 'Partitions K');
  let thomaeRationalSum = 0;
  for (let i = 0; i < K; i += 1) thomaeRationalSum += thomaeRational(2*i+1, 2*K) / K;
  return { K, rationalFamily: '(2i+1)/(2K)', irrationalFamily: '(i+√2/2)/K',
    dirichlet: { rationalSum: 1, irrationalSum: 0, lowerDarboux: 0, upperDarboux: 1, lebesgueIntegral: 0 },
    thomae: { rationalSum: thomaeRationalSum, irrationalSum: 0, riemannIntegral: 0, lebesgueIntegral: 0 } };
}
// #endregion pathological-samples
