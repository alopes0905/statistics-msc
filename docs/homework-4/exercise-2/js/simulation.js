import { createWelford, updateWelford, getWelfordStatistics } from '../../shared/welford.js';
import { summarizeCheckpoint, validateN } from './statistics.js';

export const MAX_SYSTEMS = 1000;
export const MAX_HACKERS = 1000;
export const MODULUS = 2147483647;
export const SYSTEM_COUNTS = Object.freeze([2, 5, 10, 20, 50, 100, 500, 1000]);
export const DEFAULTS = Object.freeze({ m: 1000, maxN: 1000, seed: 2026 });

function integer(value, minimum, maximum, name) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
}

export function validateParameters(parameters) {
  if (!parameters || typeof parameters !== 'object') throw new TypeError('Simulation parameters are required.');
  const { m, maxN, seed } = parameters;
  integer(m, 2, MAX_HACKERS, 'Hackers m'); validateN(maxN);
  integer(seed, 1, MODULUS - 1, 'Seed');
  return { m, maxN, seed };
}

function modularPower(base, exponent) {
  let result = 1n;
  while (exponent > 0n) {
    if (exponent & 1n) result = result * base % BigInt(MODULUS);
    base = base * base % BigInt(MODULUS); exponent >>= 1n;
  }
  return result;
}

/** Fixed disjoint blocks of 1,000 draws, unchanged when m or maxN changes.
 * Deterministic PRNG allocation approximates, rather than proves, iid sampling. */
export function createStream(seed, hacker = 0) {
  integer(seed, 1, MODULUS - 1, 'Seed'); integer(hacker, 0, MAX_HACKERS - 1, 'Hacker index');
  let state = Number(BigInt(seed) * modularPower(16807n, BigInt(hacker * MAX_SYSTEMS)) % BigInt(MODULUS));
  return () => { state = 16807 * state % MODULUS; return state; };
}

/** There are exactly (2³¹−2)/11 = 195,225,786 generator states per score.
 * Integer buckets avoid modulo bias and floating-point threshold ambiguity. */
export function sampleScore(draw) {
  integer(draw, 1, MODULUS - 1, 'Generator draw');
  return Math.floor((draw - 1) / 195225786);
}

// #region hacker-trajectory
/** One shared Welford accumulator processes each hacker's actual score prefix. */
export function generateTrajectory({ seed, hacker = 0, steps }) {
  validateN(steps);
  const random = createStream(seed, hacker), state = createWelford();
  const scores = [], means = [], variances = [];
  for (let i = 0; i < steps; i += 1) {
    const score = sampleScore(random());
    updateWelford(state, score);
    const statistics = getWelfordStatistics(state);
    scores.push(score); means.push(statistics.mean); variances.push(statistics.sampleVariance);
  }
  return { scores, means, variances };
}
// #endregion hacker-trajectory

// #region sampling-experiment
/** Every checkpoint and chart uses prefixes of these same m trajectories. */
export function simulate(parameters) {
  const config = validateParameters(parameters);
  const counts = [...new Set([...SYSTEM_COUNTS.filter(n => n <= config.maxN), config.maxN])];
  const means = counts.map(() => []), variances = counts.map(() => []), paths = [];
  for (let hacker = 0; hacker < config.m; hacker += 1) {
    const trajectory = generateTrajectory({ seed: config.seed, hacker, steps: config.maxN });
    counts.forEach((n, i) => {
      means[i].push(trajectory.means[n - 1]);
      variances[i].push(trajectory.variances[n - 1]);
    });
    if (hacker < 20) paths.push(trajectory);
  }
  return { config, scoresGenerated: config.m * config.maxN, paths,
    snapshots: counts.map((n, i) => summarizeCheckpoint(n, means[i], variances[i])) };
}
// #endregion sampling-experiment
