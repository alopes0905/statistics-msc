import { compositeSimpson, erfSeries, erfSeriesTerms, gaussLegendre } from './numerical-methods.js';

export function validateX(x) {
  if(!Number.isFinite(x) || Math.abs(x)>10) throw new RangeError('Use a finite x from −10 to 10.');
  return x;
}

export function normalDensity(x) {
  if(!Number.isFinite(x)) throw new TypeError('The density argument must be finite.');
  return Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);
}

export function cdfSimpson(x,panels=128) {
  validateX(x);
  const integral=compositeSimpson(normalDensity,0,x,panels);
  // Deliberately no clipping: subtraction error in the baseline remains visible.
  return {value:0.5+integral.value,densityEvaluations:integral.evaluations,quadratureEvaluations:integral.evaluations,terms:0};
}

export function cdfSeries(x,options) {
  validateX(x);
  if(Math.abs(x)>2) throw new RangeError('The adaptive CDF series is restricted to |x|≤2 to control cancellation.');
  const result=erfSeries(x/Math.SQRT2,options);
  return {value:0.5*(1+result.value),terms:result.terms,densityEvaluations:0,quadratureEvaluations:0,truncationBound:result.truncationBound/2};
}

export function cdfSeriesTerms(x,terms) {
  validateX(x);
  const result=erfSeriesTerms(x/Math.SQRT2,terms);
  return {value:0.5*(1+result.value),terms:result.terms,densityEvaluations:0,quadratureEvaluations:0};
}

// #region direct-normal-tail
/** Q(z)=φ(z)∫₀∞ exp(−zu−u²/2)du. On u≥U, the exponent's slope
 * is at most −(z+U), giving the stated omitted-tail bound after integration. */
export function normalTail(z,nodes=32,cutoff=8) {
  if(!Number.isFinite(z) || z<2 || z>10 || !Number.isFinite(cutoff) || cutoff<4 || cutoff>12) throw new RangeError('Tail quadrature supports 2≤z≤10 and 4≤cutoff≤12.');
  const density=normalDensity(z);
  const integral=gaussLegendre(u=>Math.exp(-z*u-u*u/2),0,cutoff,nodes);
  return {value:density*integral.value,
    truncationBound:density*Math.exp(-z*cutoff-cutoff*cutoff/2)/(z+cutoff),
    densityEvaluations:1,quadratureEvaluations:integral.evaluations,terms:0};
}
// #endregion direct-normal-tail

// #region hybrid-normal-cdf
/** No reference-data import or lookup. The smaller probability is computed
 * first, and both tails are returned even when the larger one rounds to one. */
export function normalCDF(x) {
  validateX(x);
  const z=Math.abs(x);
  let tail,method;
  if(z<=2) {
    const series=erfSeries(z/Math.SQRT2);
    tail={value:0.5*(1-series.value),terms:series.terms,densityEvaluations:0,quadratureEvaluations:0,truncationBound:series.truncationBound/2};
    method='central erf series';
  } else { tail=normalTail(z);method='direct tail · 32-point Gauss–Legendre'; }
  const cdf=x<0 ? tail.value : 1-tail.value;
  const survival=x<0 ? 1-tail.value : tail.value;
  return {...tail,value:cdf,cdf,survival,smallerTail:tail.value,method};
}
// #endregion hybrid-normal-cdf
