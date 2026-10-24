import { incrementMoments, summarizeScores, validateN } from './statistics.js';

export const MAX_STEPS = 2000;
export const MAX_ATTACKERS = 1000;
export const MAX_INCREMENTS = 2000000;
export const MODULUS = 2147483647;
export const SYSTEM_COUNTS = Object.freeze([10, 50, 100, 500, 1000, 2000]);
export const DEFAULTS = Object.freeze({ model: 'rademacher', p: 0.35, m: 1000, maxN: 2000, epsilon: 0.1, seed: 2026 });

function integer(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

export function validateParameters(parameters) {
  if (!parameters || typeof parameters !== 'object') throw new TypeError('Simulation parameters are required.');
  const { model, p, m, maxN, epsilon, seed } = parameters;
  incrementMoments(model, p);
  integer(m, 2, MAX_ATTACKERS, 'Attacker count m'); validateN(maxN);
  integer(seed, 1, MODULUS - 1, 'Seed');
  if (!Number.isFinite(epsilon) || epsilon < 0.001 || epsilon > 2) throw new RangeError('Epsilon must be between 0.001 and 2.');
  if (m * maxN > MAX_INCREMENTS) throw new RangeError('At most 2,000,000 increments may be simulated.');
  return { model, p, m, maxN, epsilon, seed };
}

function modularPower(base, exponent, modulus) {
  let result = 1n;
  while (exponent > 0n) {
    if (exponent & 1n) result = result * base % modulus;
    base = base * base % modulus; exponent >>= 1n;
  }
  return result;
}

/** Park–Miller 16807 generator. Each attacker reserves a disjoint block of
 * 2,000 draws in the full-period stream. Blocks remain fixed when m/n change.
 * This simulates the iid assumption; deterministic PRNG streams are not a proof
 * of independence and are not cryptographically secure. */
export function createStream(seed, attacker = 0) {
  integer(seed, 1, MODULUS - 1, 'Seed'); integer(attacker, 0, MAX_ATTACKERS - 1, 'Attacker index');
  const jump = modularPower(16807n, BigInt(attacker * MAX_STEPS), BigInt(MODULUS));
  let state = Number(BigInt(seed) * jump % BigInt(MODULUS));
  return () => { state = 16807 * state % MODULUS; return state / MODULUS; };
}

export function sampleIncrement(model, p, uniform) {
  incrementMoments(model, p);
  if (!Number.isFinite(uniform) || uniform < 0 || uniform >= 1) throw new RangeError('A uniform draw must be in [0,1).');
  return model === 'bernoulli' ? Number(uniform < p) : uniform < 0.5 ? 1 : -1;
}

// #region iid-trajectories
/** Each entry is a true cumulative prefix; index zero is S[a,0] = 0.
 * All increments are sampled, including those not drawn in the chart. */
export function generateTrajectory({ model, p, steps, seed, attacker = 0 }) {
  validateN(steps); incrementMoments(model, p);
  const random = createStream(seed, attacker);
  const path = [0];
  for (let k = 1; k <= steps; k += 1) {
    path.push(path[k - 1] + sampleIncrement(model, p, random()));
  }
  return path;
}

export function simulate(parameters) {
  const config = validateParameters(parameters);
  const counts = [...new Set([...SYSTEM_COUNTS.filter(n => n <= config.maxN), config.maxN])];
  const totals = counts.map(() => []), paths = [];
  for (let attacker = 0; attacker < config.m; attacker += 1) {
    const path = generateTrajectory({ ...config, steps: config.maxN, attacker });
    counts.forEach((n, i) => { totals[i].push(path[n]); });
    if (attacker < 20) paths.push(path);
  }
  return { config, increments: config.m * config.maxN, paths,
    snapshots: counts.map((n, i) => summarizeScores(totals[i], n, config.model, config.p, config.epsilon)) };
}
// #endregion iid-trajectories
