import { MAX_PARTITIONS } from './functions.js';
import { integer, sum } from '../../shared/numerics.js';

// #region riemann-rule
/** Tagged sums, not Darboux extrema. Midpoints avoid an improper left endpoint. */
export function riemann(fn, K, rule = 'midpoint') {
  integer(K, 1, MAX_PARTITIONS, 'Partitions K');
  if (!fn || !Array.isArray(fn.domain) || typeof fn.evaluate !== 'function') throw new TypeError('A documented function is required.');
  const [a,b] = fn.domain;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) throw new RangeError('Use a finite increasing domain.');
  if (!['left','midpoint','right'].includes(rule)) throw new RangeError('Choose left, midpoint or right sampling.');
  if (fn.improper && rule === 'left') throw new RangeError('The improper function cannot be evaluated at x=0; use midpoints or right endpoints.');
  const width = (b-a)/K, offset = rule === 'left' ? 0 : rule === 'right' ? 1 : 0.5;
  const values = Array.from({length:K}, (_,i) => fn.evaluate(a+(i+offset)*width));
  const value=width*sum(values);
  if(!Number.isFinite(value))throw new RangeError('The domain sum exceeded finite precision.');
  return { value, fEvaluations: K, rule, K };
}
// #endregion riemann-rule
