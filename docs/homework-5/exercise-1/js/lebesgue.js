import { MAX_PARTITIONS } from './functions.js';
import { integer, sum } from '../../shared/numerics.js';

// #region layer-cake
/** Numerically integrate actual superlevel-set lengths along the value axis.
 * Endpoints are shared by the lower and upper sums. No domain sample bins. */
export function layerCake(fn, K, cutoff = 8) {
  integer(K, 1, MAX_PARTITIONS, 'Value partitions K');
  if (!fn || typeof fn.measure !== 'function') throw new TypeError('A superlevel-measure function is required.');
  const H = fn.improper ? cutoff : fn.height;
  if (!Number.isFinite(H) || H <= 0 || (fn.improper && (H < 1 || H > 64))) throw new RangeError('Use a positive finite height; singular cutoff T must be 1..64.');
  let fEvaluations = 0, rootIterations = 0, measureEvaluations = 0;
  function measure(t) {
    const result = fn.measure(t);
    if (![result.value,result.lower,result.upper].every(Number.isFinite) || result.lower < 0 || result.lower > result.value || result.value > result.upper) throw new RangeError('Invalid preimage measure.');
    measureEvaluations += 1; fEvaluations += result.fEvaluations; rootIterations += result.rootIterations;
    return result;
  }
  const dt = H/K;
  const endpoints = Array.from({length:K+1},(_,j)=>measure(j*dt));
  const midpoints = Array.from({length:K},(_,j)=>measure((j+0.5)*dt));
  const lower = dt*sum(endpoints.slice(1).map(row=>row.lower));
  const upper = dt*sum(endpoints.slice(0,-1).map(row=>row.upper));
  return { K, height:H, lower, midpoint:dt*sum(midpoints.map(row=>row.value)), upper,
    enclosureWidth:upper-lower, rootUncertainty:dt*sum(midpoints.map(row=>row.upper-row.lower)),
    fEvaluations, rootIterations, measureEvaluations,
    target:fn.improper ? 2-1/H : fn.reference, omittedTail:fn.improper ? 1/H : 0 };
}
// #endregion layer-cake
