import { getFunction, PARTITIONS, MAX_PARTITIONS, pathologicalSamples } from './functions.js';
import { riemann } from './riemann.js';
import { layerCake } from './lebesgue.js';
import { integer, benchmark } from '../../shared/numerics.js';

export function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new TypeError('Integration parameters are required.');
  const fn = getFunction(config.id);
  integer(config.K,1,MAX_PARTITIONS,'Partitions K');
  if (!['left','midpoint','right'].includes(config.rule)) throw new RangeError('Choose a supported domain sampling rule.');
  if (fn.improper && config.rule === 'left') throw new RangeError('Use midpoint or right sampling for the singular function.');
  if (!Number.isFinite(config.cutoff) || config.cutoff < 1 || config.cutoff > 64) throw new RangeError('Singular cutoff T must be 1..64.');
  return { id:config.id, K:config.K, rule:config.rule, cutoff:config.cutoff };
}

/** Selected sum and the convergence experiment share the exact same algorithms. */
export function integrationExperiment(parameters, timing = true) {
  const config = validateConfig(parameters), fn = getFunction(config.id);
  function row(K) {
    const domain = riemann(fn,K,config.rule), range = layerCake(fn,K,config.cutoff);
    return { K, domain, range, reference:fn.reference,
      domainError:Math.abs(domain.value-fn.reference), rangeError:Math.abs(range.midpoint-range.target),
      totalRangeError:Math.abs(range.midpoint-fn.reference),
      domainTiming:timing ? benchmark(()=>riemann(fn,K,config.rule)) : null,
      rangeTiming:timing ? benchmark(()=>layerCake(fn,K,config.cutoff)) : null };
  }
  const rows = PARTITIONS.map(row);
  const selected = rows.find(row=>row.K===config.K) ?? row(config.K);
  const cutoffStudy = fn.improper ? [2,4,8,16,32,64].map(T => ({T,...layerCake(fn,1024,T)})) : [];
  return { config, selected, rows, cutoffStudy, pathological:PARTITIONS.map(pathologicalSamples) };
}
