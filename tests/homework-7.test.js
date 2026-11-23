import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractCodeRegion } from '../docs/assets/js/code-viewer.js';
import { scanHTML } from '../tools/check.js';
import {
  DEFAULTS, modelMoments, sampleMeanTheory, standardizedMean, simulate,
  summarize, histogram, spike, typewriterInterval
} from '../docs/homework-7/exercise-1/js/convergence.js';
import { conditional, updateHypotheses, analyzeAlert, betaMoments, updateBeta, sequentialBeta } from '../docs/homework-7/exercise-2/js/bayes.js';
import { trajectoryChart, mseChart, distributionChart, betaMeanChart } from '../docs/homework-7/shared/charts.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
function close(actual, expected, tolerance = 2e-14) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} versus ${expected}`);
}
const total = values => values.reduce((sum, value) => sum + value, 0);

test('HW7 sample-mean theory and standardization match exact two-draw Bernoulli enumeration', () => {
  const moments = modelMoments('bernoulli', 0.25);
  assert.deepEqual(moments, { mean: 1 / 4, variance: 3 / 16 });
  assert.deepEqual(modelMoments('rademacher'), { mean: 0, variance: 1 });
  // Two Bernoulli(1/4) trials: 0, 1, 2 successes have weights 9, 6, 1 out of 16.
  const meanValues = [0, 0.5, 1], weights = [9 / 16, 6 / 16, 1 / 16];
  const expected = total(meanValues.map((value, i) => value * weights[i]));
  const theory = sampleMeanTheory('bernoulli', 0.25, 2, 0.5);
  close(theory.mean, expected);
  close(theory.variance, 3 / 32);
  close(theory.mse, 3 / 32);
  close(theory.chebyshev, 3 / 8);
  const z = meanValues.map(value => standardizedMean(value, 2, moments));
  assert.ok(z[0] < 0 && z[1] > 0);
  close(total(z.map((value, i) => value * weights[i])), 0);
  close(total(z.map((value, i) => value * value * weights[i])), 1);
  assert.equal(theory.normalizedVariance, 1);
  close(sampleMeanTheory('rademacher', undefined, 10, 0.01 + 0.001).chebyshev, 1);
});

test('HW7 empirical variance uses m−1, MSE uses m, and threshold equality is counted', () => {
  const result = summarize([5, 7, 7, 9], 20, DEFAULTS);
  close(result.mean, 0.35);
  close(result.variance, 1 / 150);
  close(result.mse, 0.005);
  assert.equal(result.deviation, 0.5); // 5/20 and 9/20 each differ from 7/20 by exactly 1/10.
  close(result.zVariance, 160 / 273);
  const other = summarize([-2, 0, 2, 4], 20, { ...DEFAULTS, model: 'rademacher' });
  assert.equal(other.deviation, 0.75);
});

test('HW7 a zero-variance Bernoulli model keeps LLN measures while leaving Z undefined', () => {
  for (const p of [0, 1]) {
    const result = simulate({ ...DEFAULTS, p, m: 3, maxN: 20 });
    const row = result.snapshots[1];
    assert.equal(row.mean, p);
    for (const key of ['variance', 'mse', 'deviation']) assert.equal(row[key], 0);
    for (const key of ['z', 'zMean', 'zVariance']) assert.equal(row[key], null);
    assert.equal(row.theory.normalizedVariance, null);
    assert.equal(row.theory.chebyshev, 0);
  }
});

test('HW7 deterministic Park–Miller block fixture preserves prefixes across n and m', () => {
  const config = { ...DEFAULTS, seed: 1, m: 4, maxN: 50 };
  const result = simulate(config);
  // Checked independently via integer modular exponentiation and rational thresholds.
  assert.deepEqual(result.paths, [[0.4, 0.4, 0.3], [0.4, 0.3, 0.3], [0.3, 0.3, 0.28], [0.7, 0.45, 0.4]]);
  assert.deepEqual(simulate(config), result);
  assert.notDeepEqual(simulate({ ...config, seed: 2 }).paths, result.paths);
  assert.deepEqual(simulate({ ...config, maxN: 20 }).snapshots, result.snapshots.slice(0, 2));
  assert.deepEqual(simulate({ ...config, m: 9 }).paths.slice(0, 4), result.paths);
  close(result.snapshots[0].mse, 0.0325);
});

test('HW7 default Monte Carlo output matches independent full-trajectory summaries', () => {
  const result = simulate();
  const n20 = result.snapshots[1], n1000 = result.snapshots.at(-1);
  for (const row of result.snapshots) assert.equal(row.z.length, 1000);
  close(n20.mean, 0.3537);
  assert.equal(n20.deviation, 0.473);
  close(n1000.mean, 0.349498);
  close(n1000.variance, 0.00021764163763763765);
  close(n1000.mse, 0.000217676);
  close(n1000.zMean, -0.033282275915416146);
  close(n1000.zVariance, 0.9566665390665391);
});

test('HW7 simulation rejects invalid models, probability, checkpoint, count, seed and tolerance', () => {
  for (const edit of [
    { model: 'unknown' }, { p: -0.01 }, { p: NaN }, { p: 1.01 }, { m: 1 }, { m: 2001 },
    { m: 2.5 }, { maxN: 15 }, { maxN: 2000 }, { seed: 0 }, { seed: 2147483647 }, { epsilon: 0 }, { epsilon: Infinity }
  ]) assert.throws(() => simulate({ ...DEFAULTS, ...edit }), RangeError);
  assert.throws(() => sampleMeanTheory('rademacher', 0, 0, 0.1), RangeError);
});

test('HW7 typewriter dyadic indexing and spike second moment match finite counterexample calculations', () => {
  for (const n of [1, 4, 100, 900]) {
    const item = spike(n);
    close(item.height ** 2 * item.probability, 1);
    assert.equal(item.secondMoment, 1);
  }
  assert.deepEqual(typewriterInterval(1), { left: 0, right: 1, secondMoment: 1 });
  assert.deepEqual(typewriterInterval(7), { left: 3 / 4, right: 1, secondMoment: 1 / 4 });
  for (let k = 1; k < 10; k++) {
    const start = 2 ** k;
    const stage = Array.from({ length: start }, (_, i) => typewriterInterval(start + i));
    assert.equal(stage[0].left, 0);
    assert.equal(stage.at(-1).right, 1);
    assert.equal(stage.filter(({ left, right }) => left <= 5 / 8 && 5 / 8 < right).length, 1);
    assert.equal(total(stage.map(item => item.secondMoment)), 1);
    for (let i = 1; i < stage.length; i++) assert.equal(stage[i].left, stage[i - 1].right);
  }
});

test('HW7 histogram includes endpoints, counts every observation, and integrates to one', () => {
  const bins = histogram([-2, -1.1, -1, 0, 1, 2], 2, 4);
  assert.deepEqual(bins.map(bin => bin.frequency), [2, 1, 1, 2]);
  close(total(bins.map(bin => bin.density * (bin.right - bin.left))), 1);
  const snapshot = simulate({ ...DEFAULTS, m: 19, maxN: 10 });
  const actual = histogram(snapshot.snapshots[0].z, snapshot.bound);
  assert.equal(total(actual.map(bin => bin.frequency)), 19);
  close(total(actual.map(bin => bin.density * (bin.right - bin.left))), 1);
  assert.throws(() => histogram([5], 4), RangeError);
});

test('HW7 SVG coordinates stay finite for one checkpoint, negative means and zero variance', () => {
  for (const model of ['rademacher', 'bernoulli']) {
    for (const maxN of [10, 50, 1000]) {
      const data = simulate({ ...DEFAULTS, p: 1, model, m: 4, maxN });
      const graphics = [trajectoryChart(data, model), mseChart(data), betaMeanChart(0.2, null, 0.2)];
      if (data.snapshots[0].z !== null) graphics.push(distributionChart(histogram(data.snapshots[0].z, data.bound), 10, data.bound));
      for (const svg of graphics) {
        assert.match(svg, /role="img"/);
        assert.doesNotMatch(svg, /NaN|Infinity/);
      }
    }
  }
});

test('HW7 computes conditional probability and normalizes posterior across three hypotheses', () => {
  close(conditional(1 / 6, 1 / 2), 1 / 3);
  assert.equal(conditional(0, 0), null);
  assert.throws(() => conditional(1 / 2, 1 / 3), RangeError);
  const result = updateHypotheses([0.5, 0.25, 0.25], [0.25, 0.5, 1]);
  assert.deepEqual(result.weights, [0.125, 0.125, 0.25]);
  assert.equal(result.evidence, 0.5);
  assert.deepEqual(result.posterior, [0.25, 0.25, 0.5]);
  assert.throws(() => updateHypotheses([0.5, 0.6], [1, 0]), RangeError);
  assert.throws(() => updateHypotheses([1], []), RangeError);
});

test('HW7 expected confusion counts independently verify alert posteriors and odds', () => {
  const result = analyzeAlert(0.02, 0.90, 0.05);
  const expectedCounts = [180, 20, 490, 9310];
  result.confusion.flat().forEach((value, i) => close(value, expectedCounts[i], 2e-12));
  close(result.positive.evidence, 670 / 10000);
  close(result.negative.evidence, 9330 / 10000);
  close(result.positive.posterior[0], 180 / 670);
  close(result.negative.posterior[0], 20 / 9330);
  assert.notEqual(result.positive.posterior[0], result.sensitivity);
  assert.equal(result.likelihoodRatio, 18);
  close(result.posteriorOdds, 180 / 490);
  close(result.posteriorOdds, result.priorOdds * result.likelihoodRatio);
  assert.ok(analyzeAlert(0.002, 0.9, 0.05).positive.posterior[0] < result.positive.posterior[0]);
  assert.ok(analyzeAlert(0.2, 0.9, 0.05).positive.posterior[0] > result.positive.posterior[0]);
});

test('HW7 distinguishes impossible evidence, certain posterior, unbounded odds and underflow', () => {
  assert.equal(analyzeAlert(0.2, 0, 0).positive.posterior, null);
  assert.equal(analyzeAlert(0.2, 1, 1).negative.posterior, null);
  assert.equal(analyzeAlert(0, 1, 0).positive.posterior, null);
  assert.deepEqual(analyzeAlert(0.2, 1, 0).positive.posterior, [1, 0]);
  assert.equal(analyzeAlert(0.2, 1, 0).likelihoodRatio, 'Unbounded');
  assert.equal(analyzeAlert(0, 0.5, 0.5).positive.posterior[0], 0);
  assert.equal(analyzeAlert(1, 0.5, 0.5).negative.posterior[0], 1);
  const rare = analyzeAlert(Number.MIN_VALUE, Number.MIN_VALUE, 0).positive;
  assert.equal(rare.underflow, true);
  assert.deepEqual(rare.posterior, [1, 0]);
  for (const value of [NaN, Infinity, -0.01, 1.01]) assert.throws(() => analyzeAlert(0.02, value, 0.05), RangeError);
});

test('HW7 prior and posterior Beta moments and predictive probability agree with exact ratios', () => {
  const result = updateBeta(2, 8, 20, 7);
  close(result.prior.mean, 1 / 5);
  close(result.prior.variance, 4 / 275);
  assert.equal(result.prior.concentration, 10);
  assert.equal(result.posterior.alpha, 9);
  assert.equal(result.posterior.beta, 21);
  assert.equal(result.posterior.concentration, 30);
  close(result.posterior.mean, 3 / 10);
  close(result.posterior.variance, 21 / 3100);
  close(result.sampleProportion, 7 / 20);
  close(result.predictive, 3 / 10);
  close(betaMoments(1, 1).variance, 1 / 12);
});

test('HW7 sequential updates are order invariant and agree with count updates', () => {
  const outcomes = [1, 1, 0, 1, 0, 1, 0, 0, 1];
  for (const [alpha, beta] of [[2, 8], [0.3, 0.7]]) {
    const batch = updateBeta(alpha, beta, 9, 5).posterior;
    for (const seq of [outcomes, [...outcomes].reverse()]) {
      const result = sequentialBeta(alpha, beta, seq);
      for (const key of ['alpha', 'beta', 'mean', 'variance']) close(result[key], batch[key]);
    }
  }
  assert.throws(() => sequentialBeta(1, 1, [0, 2]), RangeError);
});

test('HW7 prior sensitivity with fixed evidence and the n = 0 identity', () => {
  for (const [a, b, alpha, beta, mean] of [[1, 1, 8, 14, 4 / 11], [2, 8, 9, 21, 0.3], [20, 80, 27, 93, 0.225]]) {
    const row = updateBeta(a, b, 20, 7).posterior;
    assert.equal(row.alpha, alpha);
    assert.equal(row.beta, beta);
    close(row.mean, mean);
  }
  const empty = updateBeta(0.3, 0.7, 0, 0);
  assert.deepEqual(empty.posterior, empty.prior);
  assert.equal(empty.sampleProportion, null);
  close(empty.predictive, 0.3);
  for (const args of [[0, 1, 2, 1], [1, -1, 2, 1], [NaN, 1, 2, 1], [1, 1, -1, 0], [1, 1, 2.5, 0], [1, 1, 10, 11], [1, 1, 10, -1], [1, 1, 10001, 0]]) {
    assert.throws(() => updateBeta(...args), RangeError);
  }
});

test('HW7 reports retain required qualifications, relative routes and executed source excerpts', async () => {
  const base = 'docs/homework-7';
  const home = await read('docs/index.html');
  assert.equal([...home.matchAll(/href="\.\/homework-7\/"/g)].length, 1);
  const landing = await read(`${base}/index.html`);
  const links = scanHTML(landing).filter(tag => tag.attributes.get('class') === 'homework-card').map(tag => tag.attributes.get('href'));
  assert.deepEqual(links, ['./exercise-1/', './exercise-2/']);
  for (const i of [1, 2]) {
    const page = await read(`${base}/exercise-${i}/index.html`);
    assert.equal([...page.matchAll(/class="section-number"/g)].length, 4);
    assert.ok(page.includes(`href="../exercise-${3 - i}/"`));
    assert.match(page, /href="\.\.\/"|id="references"/);
    const sourceTags = scanHTML(page).filter(tag => tag.attributes.has('data-source'));
    assert.equal(sourceTags.length, 2);
    for (const { attributes } of sourceTags) {
      const file = await read(`${base}/exercise-${i}/${attributes.get('data-source')}`);
      assert.match(extractCodeRegion(file, attributes.get('data-region')), /export function/);
    }
  }
  const ex1 = await read(`${base}/exercise-1/index.html`);
  assert.match(ex1, /Almost sure → In probability → In distribution<br>L² → In probability → In distribution/);
  assert.match(ex1, /infinitely many ones and infinitely many zeros/);
  assert.match(ex1, /2Σᵢ&lt;ⱼ Cov\(Xᵢ,Xⱼ\)/);
  assert.match(ex1, /zero covariance also suffices/);
  assert.match(ex1, /makes no assertion of almost sure convergence/);
});
