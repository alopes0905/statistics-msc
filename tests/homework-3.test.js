import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createStream, sampleIncrement, generateTrajectory, simulate, DEFAULTS, MODULUS, MAX_STEPS, validateParameters } from '../docs/homework-3/js/simulation.js';
import { scoreValues, sampleMoments, theoreticalMoments, incrementMoments, deviationProbability, chebyshevBound, summarizeScores, scoreHistogram, normalPDF, normalCDF, normalDistance, cltComparison } from '../docs/homework-3/js/statistics.js';
import { extractCodeRegion } from '../docs/assets/js/code-viewer.js';
import { scanHTML } from '../tools/check.js';
import { createDevServer } from '../tools/dev-server.js';

const root = new URL('../', import.meta.url);
const close = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} ≈ ${expected}`);

test('HW3 Park–Miller matches published first states and the 10,000-step reference', () => {
  const stream = createStream(1);
  for (const state of [16807, 282475249, 1622650073, 984943658, 1144108930]) assert.equal(Math.round(stream() * MODULUS), state);
  const check = createStream(1); let last;
  for (let i = 0; i < 10000; i++) last = check();
  assert.equal(Math.round(last * MODULUS), 1043618065);
});

test('HW3 generator sequence agrees with an independent BigInt recurrence', () => {
  for (const seed of [1, 2026, MODULUS - 1]) {
    const random = createStream(seed); let state = BigInt(seed);
    for (let i = 0; i < 100; i++) {
      state = state * 16807n % 2147483647n;
      assert.equal(random(), Number(state) / 2147483647);
    }
  }
});

test('HW3 attacker blocks are distinct and exact disjoint continuations, not reseeded copies', () => {
  const base = createStream(2026);
  const firstStates = new Set();
  for (let attacker = 0; attacker < 10; attacker++) {
    const block = createStream(2026, attacker), first = block();
    firstStates.add(first); assert.equal(first, base());
    for (let i = 1; i < MAX_STEPS; i++) assert.equal(block(), base());
  }
  assert.equal(firstStates.size, 10);
  const last = createStream(2026, 999);
  assert.ok(last() > 0 && last() < 1);
});

test('HW3 reproducibility and stream changes are deterministic', () => {
  const parameters = { ...DEFAULTS, m: 100, maxN: 100 };
  assert.deepEqual(simulate(parameters), simulate(parameters));
  assert.notDeepEqual(simulate(parameters).paths, simulate({ ...parameters, seed: 2027 }).paths);
  for (const args of [[0], [MODULUS], ['1'], [1, -1], [1, 1000], [1, 0.5]]) assert.throws(() => createStream(...args));
});

test('HW3 Bernoulli and Rademacher sampler support and exact threshold conventions', () => {
  for (const u of [0, 0.2, 0.35, 0.5, 0.999999]) {
    assert.ok([0, 1].includes(sampleIncrement('bernoulli', 0.35, u)));
    assert.ok([-1, 1].includes(sampleIncrement('rademacher', 0.35, u)));
    assert.equal(sampleIncrement('bernoulli', 0, u), 0); assert.equal(sampleIncrement('bernoulli', 1, u), 1);
  }
  assert.equal(sampleIncrement('bernoulli', 0.35, 0.35), 0);
  assert.equal(sampleIncrement('rademacher', 0.35, 0.5), -1);
  for (const u of [-1, 1, NaN, '0.5']) assert.throws(() => sampleIncrement('bernoulli', 0.35, u));
});

test('HW3 parameter validation rejects malformed, excessive, and nonfinite work requests', () => {
  assert.deepEqual(validateParameters(DEFAULTS), DEFAULTS);
  for (const change of [{ model: 'gaussian' }, { p: -0.1 }, { p: 1.1 }, { p: NaN }, { p: '0.35' }, { m: 1 }, { m: 1001 }, { m: 1.5 }, { maxN: 0 }, { maxN: 2001 }, { maxN: 1.1 }, { epsilon: 0 }, { epsilon: 0.0001 }, { epsilon: 2.1 }, { seed: Infinity }, { seed: '2026' }]) {
    assert.throws(() => simulate({ ...DEFAULTS, ...change }));
  }
  assert.throws(() => validateParameters(null));
});

test('HW3 simulated prefixes stay fixed when n or m increases', () => {
  for (const model of ['bernoulli', 'rademacher']) {
    const small = simulate({ ...DEFAULTS, model, m: 100, maxN: 100 });
    const large = simulate({ ...DEFAULTS, model, m: 500, maxN: 500 });
    for (let a = 0; a < 20; a++) assert.deepEqual(small.paths[a], large.paths[a].slice(0, 101));
    for (const snapshot of small.snapshots) {
      const larger = large.snapshots.find(s => s.n === snapshot.n);
      assert.deepEqual(snapshot.metrics.total.values, larger.metrics.total.values.slice(0, 100));
    }
  }
});

test('HW3 hand-worked increments produce the required totals and normalizations', () => {
  const bernoulli = [1, 0, 1, 1], rademacher = [1, -1, 1, 1];
  assert.deepEqual(scoreValues(bernoulli.reduce((a, b) => a + b), 4), { total: 3, average: 0.75, normalized: 1.5 });
  assert.deepEqual(scoreValues(rademacher.reduce((a, b) => a + b), 4), { total: 2, average: 0.5, normalized: 1 });
  assert.deepEqual(scoreValues(-1, 1), { total: -1, average: -1, normalized: -1 });
  for (const args of [[NaN, 4], [1, 0], [1, -1], [1, 0.5]]) assert.throws(() => scoreValues(...args));
});

test('HW3 every attacker path agrees with independent sampled increments at every step', () => {
  for (const model of ['bernoulli', 'rademacher']) for (const attacker of [0, 1, 99, 999]) {
    const path = generateTrajectory({ model, p: 0.35, steps: 100, seed: 2026, attacker });
    // Independent BigInt jump by straightforward recurrence, not modularPower.
    let state = 2026n, sum = 0;
    for (let i = 0; i < attacker * MAX_STEPS; i++) state = state * 16807n % 2147483647n;
    assert.equal(path[0], 0);
    for (let k = 1; k <= 100; k++) {
      state = state * 16807n % 2147483647n;
      const u = Number(state) / 2147483647;
      sum += model === 'bernoulli' ? (u < 0.35 ? 1 : 0) : (u < 0.5 ? 1 : -1);
      assert.equal(path[k], sum);
      if (model === 'rademacher') assert.equal((sum + k) % 2, 0);
    }
  }
});

test('HW3 Bernoulli boundary trajectories and all empirical variances are exact', () => {
  for (const p of [0, 1]) {
    const result = simulate({ ...DEFAULTS, model: 'bernoulli', p, m: 100 });
    for (const snapshot of result.snapshots) {
      assert.ok(snapshot.metrics.total.values.every(x => x === p * snapshot.n));
      for (const metric of ['total', 'average', 'normalized']) {
        assert.equal(snapshot.metrics[metric].empirical.variance, 0); assert.equal(snapshot.metrics[metric].theoretical.variance, 0);
      }
      assert.equal(snapshot.lln.probability, 0); assert.equal(snapshot.lln.bound, 0);
    }
  }
});

test('HW3 exact Bernoulli moments match independent rational examples', () => {
  const theory = theoreticalMoments('bernoulli', 0.25, 16);
  assert.deepEqual(theory, { total: { mean: 4, variance: 3 }, average: { mean: 0.25, variance: 3 / 256 }, normalized: { mean: 1, variance: 3 / 16 } });
  assert.deepEqual(theoreticalMoments('bernoulli', 0.25, 1), { total: { mean: 0.25, variance: 3 / 16 }, average: { mean: 0.25, variance: 3 / 16 }, normalized: { mean: 0.25, variance: 3 / 16 } });
  for (const p of [0, 1]) for (const value of Object.values(theoreticalMoments('bernoulli', p, 100))) assert.equal(value.variance, 0);
});

test('HW3 Rademacher theory stabilizes normalized variance and distinguishes the three scalings', () => {
  assert.deepEqual(incrementMoments('rademacher', 0.35), { mu: 0, sigma2: 1 });
  for (const n of [1, 10, 100, 1000, 2000]) {
    assert.deepEqual(theoreticalMoments('rademacher', 0.35, n), { total: { mean: 0, variance: n }, average: { mean: 0, variance: 1 / n }, normalized: { mean: 0, variance: 1 } });
    const bern = theoreticalMoments('bernoulli', 0.35, n);
    close(bern.normalized.mean, 0.35 * Math.sqrt(n)); close(bern.normalized.variance, 0.2275);
  }
});

test('HW3 Welford variance uses m−1 and is stable under a large translation', () => {
  assert.deepEqual(sampleMoments([1, 2, 3]), { mean: 2, variance: 1 });
  assert.deepEqual(sampleMoments([1, 3]), { mean: 2, variance: 2 });
  assert.deepEqual(sampleMoments([5, 5, 5]), { mean: 5, variance: 0 });
  assert.deepEqual(sampleMoments([1e12 + 1, 1e12 + 2, 1e12 + 3]), { mean: 1e12 + 2, variance: 1 });
  for (const values of [[], [1], [1, NaN], [1, Infinity], ['1', 2], Array(1001).fill(1), [-1e308, 1e308]]) assert.throws(() => sampleMoments(values));
});

test('HW3 LLN counts the strict outside event and preserves decimal boundary equality', () => {
  assert.deepEqual(deviationProbability([0.25, 0.5, 0.75, 1], 0.5, 0.25), { outside: 1, probability: 0.25 });
  assert.deepEqual(deviationProbability([0.25, 0.45, 0.35, 0.451], 0.35, 0.1), { outside: 1, probability: 0.25 });
  assert.deepEqual(deviationProbability([-0.2, -0.1, 0, 0.1, 0.2], 0, 0.1), { outside: 2, probability: 0.4 });
  for (const epsilon of [0, -1, NaN]) assert.throws(() => deviationProbability([0, 1], 0.5, epsilon));
  assert.throws(() => deviationProbability([], 0.5, 0.1));
});

test('HW3 Chebyshev bounds cap at one, handle zero variance, and scale as 1/n', () => {
  assert.equal(chebyshevBound(1, 10, 0.1), 1);
  close(chebyshevBound(1, 1000, 0.1), 0.1);
  close(chebyshevBound(0.2275, 100, 0.1), 0.2275);
  assert.equal(chebyshevBound(0, 10, 1e-300), 0);
  for (const args of [[-1, 10, 0.1], [1, 0, 0.1], [1, 10, 0]]) assert.throws(() => chebyshevBound(...args));
});

test('HW3 simulation fields agree with independently computed two-pass sample moments', () => {
  const result = simulate({ ...DEFAULTS, model: 'bernoulli', m: 100, maxN: 100 });
  assert.equal(result.increments, 10000); assert.equal(result.paths.length, 20);
  for (const snapshot of result.snapshots) {
    const totals = snapshot.metrics.total.values;
    for (const metric of ['total', 'average', 'normalized']) {
      const values = totals.map(x => metric === 'total' ? x : metric === 'average' ? x / snapshot.n : x / Math.sqrt(snapshot.n));
      assert.deepEqual(snapshot.metrics[metric].values, values);
      const mean = values.reduce((a, b) => a + b) / values.length;
      const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (values.length - 1);
      close(snapshot.metrics[metric].empirical.mean, mean); close(snapshot.metrics[metric].empirical.variance, variance);
    }
    for (let a = 0; a < 20; a++) assert.equal(totals[a], result.paths[a][snapshot.n]);
    assert.ok(snapshot.lln.probability >= 0 && snapshot.lln.probability <= 1);
  }
});

test('HW3 aggregate scores are distinct from individual theory and scale correctly with m', () => {
  const summary = summarizeScores([0, 1, 2, 3], 4, 'bernoulli', 0.25, 0.1);
  assert.deepEqual(summary.aggregate, { observed: 6, mean: 4, variance: 3 });
  const rad = summarizeScores([-2, 0, 2, 4], 4, 'rademacher', 0.35, 0.1);
  assert.deepEqual(rad.aggregate, { observed: 4, mean: 0, variance: 16 });
  assert.equal(rad.metrics.total.theoretical.variance, 4);
});

test('HW3 histograms give independent hand counts, include the maximum, and integrate to one', () => {
  const totals = [0, 0, 1, 2, 2];
  for (const metric of ['total', 'average', 'normalized']) {
    const histogram = scoreHistogram(totals, 2, 'bernoulli', metric);
    assert.deepEqual(histogram.bins.map(bin => bin.count), [2, 1, 2]);
    close(histogram.bins.reduce((area, bin) => area + bin.density * (bin.right - bin.left), 0), 1);
    assert.equal(histogram.bins.reduce((sum, bin) => sum + bin.count, 0), 5);
  }
  assert.equal(scoreHistogram([0, 0], 10, 'bernoulli', 'total').bins.length, 1);
  assert.equal(scoreHistogram([10, 10], 10, 'bernoulli', 'average').bins[0].density, 10);
});

test('HW3 Rademacher lattice bins respect parity and correct transformed widths', () => {
  const totals = [-3, -1, -1, 1, 3];
  const histogram = scoreHistogram(totals, 3, 'rademacher', 'total');
  assert.equal(histogram.width, 2); assert.equal(histogram.left, -4); assert.equal(histogram.right, 4);
  assert.deepEqual(histogram.bins.map(bin => bin.count), [1, 2, 1, 1]);
  close(scoreHistogram(totals, 3, 'rademacher', 'normalized').width, 2 / Math.sqrt(3));
  for (const bad of [[0], [4], [0.5]]) assert.throws(() => scoreHistogram(bad, 3, 'rademacher', 'total'));
  assert.throws(() => scoreHistogram([-1], 3, 'bernoulli', 'total'));
  assert.throws(() => scoreHistogram([0], 3, 'bernoulli', 'bad'));
});

test('HW3 grouped histograms retain all observations at the largest supported score range', () => {
  const totals = Array.from({ length: 1000 }, (_, i) => i * 2);
  const histogram = scoreHistogram(totals, 2000, 'rademacher', 'normalized');
  assert.ok(histogram.bins.length <= 24);
  assert.equal(histogram.bins.reduce((sum, bin) => sum + bin.count, 0), 1000);
  close(histogram.bins.reduce((area, bin) => area + bin.density * histogram.width, 0), 1);
});

test('HW3 normal PDF and approximate CDF match independent normal-table values', () => {
  close(normalPDF(0), 0.3989422804014327);
  close(normalPDF(1), 0.24197072451914337);
  for (const [z, cdf] of [[0, 0.5], [0.5, 0.6914624612740131], [1, 0.8413447460685429], [1.96, 0.9750021048517795], [3, 0.9986501019683699], [-1, 0.15865525393145707]]) assert.ok(Math.abs(normalCDF(z) - cdf) < 7.5e-8);
  assert.equal(normalCDF(-Infinity), 0); assert.equal(normalCDF(Infinity), 1); assert.equal(normalPDF(Infinity), 0);
  for (const x of [0.1, 1, 5]) close(normalCDF(-x) + normalCDF(x), 1);
  for (const x of [NaN, '1', null]) { assert.throws(() => normalPDF(x)); assert.throws(() => normalCDF(x)); }
});

test('HW3 descriptive CDF distance checks jumps and ties without manufacturing p-values', () => {
  assert.equal(normalDistance([0, 0, 0, 0]), 0.5);
  close(normalDistance([-1, 0, 1]), 0.8413447460685429 - 2 / 3, 7.5e-8);
  const input = [1, -1, 0], before = [...input]; normalDistance(input); assert.deepEqual(input, before);
  const snapshot = summarizeScores([-2, 0, 0, 2], 4, 'rademacher', 0.35, 0.1);
  const comparison = cltComparison(snapshot, 'rademacher');
  assert.equal(comparison.theoreticalMean, 0); assert.equal(comparison.theoreticalVariance, 1);
  assert.equal(Object.hasOwn(comparison, 'pValue'), false);
  assert.throws(() => cltComparison(snapshot, 'bernoulli'));
});

test('HW3 the maximum 2-million-increment simulation is bounded and consistent for both models', () => {
  for (const model of ['bernoulli', 'rademacher']) {
    const result = simulate({ ...DEFAULTS, model });
    assert.equal(result.increments, 2000000); assert.equal(result.snapshots.length, 6);
    assert.ok(result.snapshots.every(s => s.metrics.total.values.length === 1000));
    assert.ok(result.paths.every(path => path.length === 2001));
  }
});

test('HW3 source excerpts expose the actual pure functions', async () => {
  for (const [file, region, functionName] of [['simulation', 'iid-trajectories', 'generateTrajectory'], ['statistics', 'empirical-moments', 'sampleMoments'], ['statistics', 'lln-deviations', 'deviationProbability'], ['statistics', 'clt-comparison', 'cltComparison']]) {
    const source = await readFile(new URL(`../docs/homework-3/js/${file}.js`, import.meta.url), 'utf8');
    assert.ok(extractCodeRegion(source, region).includes(`function ${functionName}`));
    assert.doesNotMatch(source, /Math\.random|document\.|window\./);
  }
});

test('HW3 page integrates four sections, accessible controls, real chart alternatives, and the fourth card', async () => {
  const html = await readFile(new URL('../docs/homework-3/index.html', import.meta.url), 'utf8');
  const tags = scanHTML(html), ids = new Set(tags.map(t => t.attributes.get('id')).filter(Boolean));
  assert.equal(tags.filter(t => t.name === 'section').length, 4);
  for (const id of ['foundations', 'simulation', 'distributions', 'convergence', 'references', 'histogram-rows', 'trajectory-rows', 'lln-rows', 'clt-rows']) assert.ok(ids.has(id));
  for (const tag of tags.filter(t => t.name === 'a' && t.attributes.get('href')?.startsWith('#'))) assert.ok(ids.has(tag.attributes.get('href').slice(1)));
  assert.equal(tags.filter(t => t.attributes.has('data-source')).length, 4);
  const app = await readFile(new URL('../docs/homework-3/js/app.js', import.meta.url), 'utf8');
  for (const [, id] of app.matchAll(/(?:find|show)\('([^']+)'/g)) assert.ok(ids.has(id), id);
  const charts = await readFile(new URL('../docs/homework-3/js/charts.js', import.meta.url), 'utf8');
  assert.match(charts, /role: 'img'/); assert.match(charts, /'aria-labelledby'/); assert.match(charts, /node\('desc'/);
  const home = await readFile(new URL('../docs/index.html', import.meta.url), 'utf8');
  assert.deepEqual([...home.matchAll(/<h3>(Homework [^<]+)<\/h3>/g)].map(m => m[1]), ['Homework 1.1', 'Homework 1.2', 'Homework 2', 'Homework 3']);
});

test('HW3 is served with its worker, modules, and excerpts under the Pages project subpath', async t => {
  const server = await createDevServer({ root: new URL('docs/', root).pathname, basePath: '/statistics-msc/' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/statistics-msc/`;
  for (const path of ['homework-3/', 'homework-3/style.css', 'homework-3/js/simulation.js', 'homework-3/js/statistics.js', 'homework-3/js/charts.js', 'homework-3/js/app.js', 'homework-3/js/simulation-worker.js', 'homework-01/', 'homework-02/', 'homework-2/']) {
    const response = await fetch(base + path); assert.equal(response.status, 200, path);
    if (path.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
  }
});
