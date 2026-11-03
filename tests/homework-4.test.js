import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWelford, updateWelford, getWelfordStatistics } from '../docs/homework-4/shared/welford.js';
import { parseObservations, runningStatistics } from '../docs/homework-4/exercise-1/js/app.js';
import { SCORE_MOMENTS, samplingTheory, summarizeCheckpoint, histogram } from '../docs/homework-4/exercise-2/js/statistics.js';
import { MAX_SYSTEMS, MODULUS, SYSTEM_COUNTS, DEFAULTS, createStream, sampleScore, generateTrajectory, simulate, validateParameters } from '../docs/homework-4/exercise-2/js/simulation.js';
import { extractCodeRegion } from '../docs/assets/js/code-viewer.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const close = (actual, expected, tolerance = 1e-11) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} differs from ${expected}`);
// Independent two-pass reference, used only in tests. No Welford calls here.
function reference(values) {
  const mean = values.reduce((sum, x) => sum + x, 0) / values.length;
  const SS = values.reduce((sum, x) => sum + (x - mean) ** 2, 0);
  return { mean, SS, variance: SS / (values.length - 1) };
}
function summarize(values) {
  const state = createWelford(); values.forEach(value => updateWelford(state, value));
  return getWelfordStatistics(state);
}

test('HW4: empty Welford state explicitly has undefined mean and variances', () => {
  const state = createWelford(); assert.deepEqual(state, { count: 0, mean: 0, M2: 0 });
  assert.deepEqual(getWelfordStatistics(state), { count: 0, mean: null, SS: 0, sampleVariance: null, descriptiveVariance: null });
  assert.notEqual(state, createWelford());
});

test('HW4: one observation has a mean and SS but no unbiased variance', () => {
  assert.deepEqual(summarize([7]), { count: 1, mean: 7, SS: 0, sampleVariance: null, descriptiveVariance: 0 });
});

test('HW4: n=2 initializes the first unbiased variance directly', () => {
  const result = summarize([2, 4]);
  assert.equal(result.mean, 3); assert.equal(result.SS, 2); assert.equal(result.sampleVariance, 2); assert.equal(result.descriptiveVariance, 1);
});

test('HW4: every hand-worked prefix matches exact independent fractions', () => {
  const values = [2, 4, 4, 4, 5, 5, 7, 9];
  const means = [2, 3, 10/3, 7/2, 19/5, 4, 31/7, 5];
  const sums = [0, 2, 8/3, 3, 24/5, 6, 96/7, 32];
  const variances = [null, 2, 4/3, 1, 6/5, 6/5, 16/7, 32/7];
  runningStatistics(values).forEach((row, i) => {
    close(row.mean, means[i]); close(row.SS, sums[i]);
    if (i === 0) assert.equal(row.sampleVariance, null); else close(row.sampleVariance, variances[i]);
  });
});

test('HW4: Knuth, both SS recurrences and the variance recurrence agree at every step', () => {
  const state = createWelford();
  for (const x of [-2.5, 8.25, -7, 11.5, 0, 9]) {
    const previous = { ...state }, n = state.count + 1, delta = x - previous.mean;
    updateWelford(state, x);
    close(state.mean, previous.mean + delta / n);
    close(state.M2, previous.M2 + delta * (x - state.mean));
    if (n >= 2) close(state.M2, previous.M2 + (n - 1) / n * delta ** 2);
    if (n >= 3) close(getWelfordStatistics(state).sampleVariance, (n - 2) / (n - 1) * previous.M2 / (n - 2) + delta ** 2 / n);
  }
});

test('HW4: constants have zero SS and zero defined sample variance', () => {
  assert.equal(summarize(Array(32).fill(-3.125)).sampleVariance, 0);
});

test('HW4: negative, fractional and asymmetric data match independent two-pass moments', () => {
  for (const values of [[-1, -3, -5], [0.125, -2.75, 8.5, 0, 4.75], Array.from({ length: 257 }, (_, i) => (i * 37 % 29 - 14) / 7)]) {
    const expected = reference(values), actual = summarize(values);
    close(actual.mean, expected.mean); close(actual.SS, expected.SS); close(actual.sampleVariance, expected.variance);
  }
});

test('HW4: large-offset data retain spread lost by the subtraction-of-squares formula', () => {
  const values = [1,2,3,4].map(x => 1e12 + x), expected = reference(values);
  const actual = summarize(values);
  assert.equal(actual.SS, 5); assert.equal(actual.sampleVariance, 5/3); assert.equal(actual.SS, expected.SS);
  const unstable = values.reduce((sum, x) => sum + x*x, 0) - values.length * expected.mean ** 2;
  assert.equal(unstable, 0);
});

test('HW4: nonfinite observations and nonnumeric coercions are rejected without state changes', () => {
  const state = createWelford(); updateWelford(state, 3); const previous = { ...state };
  for (const x of [NaN, Infinity, -Infinity, '3', null, undefined, {}, 1n]) {
    assert.throws(() => updateWelford(state, x), TypeError); assert.deepEqual(state, previous);
  }
});

test('HW4: malformed state, count overflow and arithmetic overflow fail explicitly', () => {
  for (const state of [null, {}, { count: -1, mean: 0, M2: 0 }, { count: 1.5, mean: 0, M2: 0 }, { count: 0, mean: 1, M2: 0 }, { count: 2, mean: 0, M2: -1 }]) {
    assert.throws(() => getWelfordStatistics(state)); assert.throws(() => updateWelford(state, 2));
  }
  assert.throws(() => updateWelford({ count: Number.MAX_SAFE_INTEGER, mean: 1, M2: 0 }, 1), RangeError);
  const state = createWelford(); updateWelford(state, 1e308); const previous = { ...state };
  assert.throws(() => updateWelford(state, -1e308), RangeError); assert.deepEqual(state, previous);
});

test('HW4: source excerpt exposes exactly the actual three-line core and both exercises share it', async () => {
  const source = await read('docs/homework-4/shared/welford.js');
  assert.match(extractCodeRegion(source, 'welford-update'), /const delta = x - mean;\n  mean \+= delta \/ \+\+count;\n  M2 \+= delta \* \(x - mean\);/);
  for (const path of ['exercise-1/js/app.js', 'exercise-2/js/simulation.js', 'exercise-2/js/statistics.js']) {
    const text = await read(`docs/homework-4/${path}`);
    assert.match(text, /from ['"]\.\.\/\.\.\/shared\/welford.js['"]/);
    assert.doesNotMatch(text, /M2\s*\+=/);
  }
});

test('HW4: short decimal-list parsing supports fractions, signs and scientific notation', () => {
  assert.deepEqual(parseObservations(' 2, -4.5 .25, +1e2 '), [2, -4.5, .25, 100]);
  for (const text of ['', ' ', 'Infinity', 'NaN', '0x10', '2x', '1e999', '1;2', Array(33).fill(1).join(' '), '1'.repeat(2001)]) assert.throws(() => parseObservations(text));
});

test('HW4: discrete-uniform moments, including fourth central moment, follow exact enumeration', () => {
  const values = Array.from({ length: 11 }, (_, k) => k);
  assert.equal(values.reduce((s,x)=>s+x,0), 55);
  assert.equal(values.reduce((s,x)=>s+x*x,0), 385);
  assert.equal(values.reduce((s,x)=>s+(x-5)**4,0), 1958);
  assert.deepEqual(SCORE_MOMENTS, { mean: 5, variance: 10, fourthCentralMoment: 178 });
});

test('HW4: theoretical estimator and across-hacker-average variances have the correct denominators', () => {
  for (const n of SYSTEM_COUNTS) {
    const theory = samplingTheory(n, 100);
    assert.equal(theory.expectedSampleMean, 5); assert.equal(theory.expectedSampleVariance, 10);
    assert.equal(theory.varianceOfSampleMeans, 10/n);
    close(theory.varianceOfSampleVariances, (178 - (n-3)/(n-1)*100)/n);
    close(theory.varianceOfMeanOfMeans, 10/(100*n));
    close(theory.varianceOfMeanOfVariances, theory.varianceOfSampleVariances/100);
  }
  assert.equal(samplingTheory(2, 2).varianceOfSampleVariances, 139);
});

test('HW4: exhaustive n=2 and n=3 score samples independently verify unbiasedness and fourth-moment formula', () => {
  for (const n of [2, 3]) {
    const means = [], variances = [];
    for (let encoded = 0; encoded < 11 ** n; encoded += 1) {
      let value = encoded; const sample = [];
      for (let i = 0; i < n; i += 1) { sample.push(value % 11); value = Math.floor(value / 11); }
      const r = reference(sample); means.push(r.mean); variances.push(r.variance);
    }
    const a = reference(means), b = reference(variances), theory = samplingTheory(n, 2);
    close(a.mean, 5); close(b.mean, 10);
    // Exhaustive population of equally likely samples: divide by number of outcomes.
    close(a.SS / means.length, theory.varianceOfSampleMeans);
    close(b.SS / variances.length, theory.varianceOfSampleVariances);
  }
});

test('HW4: theoretical variability falls with n while the expected sample variance stays 10', () => {
  for (let n = 3; n <= 1000; n += 1) {
    assert.ok(samplingTheory(n, 2).varianceOfSampleMeans < samplingTheory(n-1, 2).varianceOfSampleMeans);
    assert.ok(samplingTheory(n, 2).varianceOfSampleVariances < samplingTheory(n-1, 2).varianceOfSampleVariances);
    assert.equal(samplingTheory(n, 2).expectedSampleVariance, 10);
  }
});

test('HW4: score buckets have exactly equal integer sizes including every boundary', () => {
  const bucket = (MODULUS - 1)/11; assert.equal(bucket, 195225786);
  for (let k = 0; k <= 10; k += 1) {
    assert.equal(sampleScore(k*bucket+1), k); assert.equal(sampleScore((k+1)*bucket), k);
  }
  for (const draw of [0, MODULUS, -1, 1.5, NaN, '1']) assert.throws(() => sampleScore(draw));
});

test('HW4: Park–Miller stream matches independently known first states', () => {
  const stream = createStream(1);
  assert.deepEqual(Array.from({ length: 5 }, () => stream()), [16807, 282475249, 1622650073, 984943658, 1144108930]);
});

test('HW4: hacker streams occupy their intended fixed, nonoverlapping blocks', () => {
  const sequential = createStream(2026);
  for (let hacker = 0; hacker < 4; hacker += 1) {
    const stream = createStream(2026, hacker);
    for (let step = 0; step < MAX_SYSTEMS; step += 1) assert.equal(stream(), sequential());
  }
  for (const [seed, hacker] of [[0,0], [MODULUS,0], [1,-1], [1,1000], [1, .5]]) assert.throws(() => createStream(seed, hacker));
});

test('HW4: scores are in 0..10 and seeded simulations are reproducible', () => {
  const config = { m: 9, maxN: 50, seed: 17 };
  const a = simulate(config), b = simulate(config);
  assert.deepEqual(a, b); assert.notDeepEqual(a, simulate({ ...config, seed: 18 }));
  for (const path of a.paths) assert.ok(path.scores.every(x => Number.isInteger(x) && x >= 0 && x <= 10));
});

test('HW4: each hacker mean and unbiased variance equals two-pass reference at every checkpoint', () => {
  const result = simulate({ m: 17, maxN: 1000, seed: 919 });
  result.snapshots.forEach(snapshot => {
    result.paths.forEach((path, a) => {
      const r = reference(path.scores.slice(0, snapshot.n));
      close(snapshot.sampleMeans[a], r.mean); close(snapshot.sampleVariances[a], r.variance);
      close(path.means[snapshot.n-1], r.mean); close(path.variances[snapshot.n-1], r.variance);
    });
  });
});

test('HW4: running variance begins undefined and every n>=2 prefix is valid', () => {
  const path = generateTrajectory({ seed: 321, steps: 100 });
  assert.equal(path.variances[0], null);
  for (let n = 2; n <= 100; n += 1) {
    const r = reference(path.scores.slice(0, n)); close(path.means[n-1], r.mean); close(path.variances[n-1], r.variance);
  }
});

test('HW4: n and m changes preserve hacker prefixes and every existing checkpoint', () => {
  const small = simulate({ m: 5, maxN: 20, seed: 9 }), large = simulate({ m: 20, maxN: 100, seed: 9 });
  small.paths.forEach((path, i) => {
    for (const field of ['scores','means','variances']) assert.deepEqual(path[field], large.paths[i][field].slice(0,20));
  });
  small.snapshots.forEach((snapshot, i) => {
    assert.deepEqual(snapshot.sampleMeans, large.snapshots[i].sampleMeans.slice(0,5));
    assert.deepEqual(snapshot.sampleVariances, large.snapshots[i].sampleVariances.slice(0,5));
  });
});

test('HW4: averages and variability across hackers independently match their two-pass arrays', () => {
  const r = simulate({ m: 127, maxN: 500, seed: 77 });
  assert.equal(r.paths.length,20); assert.equal(r.scoresGenerated,127*500);
  r.snapshots.forEach(row => {
    const means = reference(row.sampleMeans), variances = reference(row.sampleVariances);
    assert.equal(row.sampleMeans.length,127); assert.equal(row.sampleVariances.length,127);
    close(row.meanOfMeans,means.mean); close(row.meanOfVariances,variances.mean);
    close(row.varianceAcrossMeans,means.variance); close(row.varianceAcrossVariances,variances.variance);
  });
});

test('HW4: paired estimates distinguish mean of variances from variance of means', () => {
  const row = summarizeCheckpoint(2, [2,4,6], [8,10,12]);
  assert.equal(row.meanOfMeans,4); assert.equal(row.meanOfVariances,10);
  assert.equal(row.varianceAcrossMeans,4); assert.equal(row.varianceAcrossVariances,4);
});

test('HW4: smallest valid simulation and arbitrary maximum n checkpoints are supported', () => {
  const smallest = simulate({ m: 2, maxN: 2, seed: 1 });
  assert.equal(smallest.snapshots.length,1); assert.equal(smallest.snapshots[0].n,2);
  assert.deepEqual(simulate({ m: 2, maxN: 17, seed: 1 }).snapshots.map(row=>row.n),[2,5,10,17]);
});

test('HW4: parameter limits and finite-number validation reject malformed configurations', () => {
  assert.deepEqual(validateParameters(DEFAULTS),DEFAULTS);
  for (const change of [{m:1},{m:1001},{m:2.5},{m:'100'},{maxN:1},{maxN:1001},{maxN:Infinity},{seed:0},{seed:MODULUS},{seed:NaN},{seed:'1'}]) assert.throws(()=>validateParameters({...DEFAULTS,...change}));
  assert.throws(()=>validateParameters(null));
  for (const n of [0,1,1.5,1001,NaN,'2']) assert.throws(()=>samplingTheory(n,10));
  for (const m of [0,1,1.5,1001,NaN,'2']) assert.throws(()=>samplingTheory(2,m));
});

test('HW4: maximum default experiment uses all scores without changing theoretical targets', () => {
  const result = simulate(DEFAULTS), last = result.snapshots.at(-1);
  assert.equal(result.scoresGenerated,1000000); assert.equal(result.snapshots.length,8);
  assert.equal(last.sampleMeans.length,1000); assert.equal(last.sampleVariances.length,1000);
  // Broad model-based check, not a guarantee or a replacement for exact tests.
  assert.ok(Math.abs(last.meanOfMeans-5)<5*Math.sqrt(last.theory.varianceOfMeanOfMeans));
  assert.ok(Math.abs(last.meanOfVariances-10)<5*Math.sqrt(last.theory.varianceOfMeanOfVariances));
  assert.ok(last.varianceAcrossMeans<result.snapshots[0].varianceAcrossMeans);
  assert.ok(last.varianceAcrossVariances<result.snapshots[0].varianceAcrossVariances);
});

test('HW4: actual estimator histograms preserve all m counts, including endpoints', () => {
  for (const snapshot of simulate({m:100,maxN:100,seed:123}).snapshots) {
    for (const values of [snapshot.sampleMeans,snapshot.sampleVariances]) {
      const h=histogram(values);
      assert.equal(h.sampleSize,100); assert.equal(h.bins.reduce((s,b)=>s+b.count,0),100);
      assert.ok(h.left<=Math.min(...values)); assert.ok(h.right>=Math.max(...values)-1e-12);
    }
  }
  assert.deepEqual(histogram([0,1,2],2).bins.map(b=>b.count),[1,2]);
  assert.equal(histogram([5,5,5]).bins[0].count,3);
});

test('HW4: malformed estimator arrays and histogram inputs fail explicitly', () => {
  for (const values of [[],[NaN],['3'],[Infinity]]) assert.throws(()=>histogram(values));
  for (const bins of [1,51,2.5]) assert.throws(()=>histogram([1,2],bins));
  for (const [a,b] of [[[1],[2]],[[1,2],[3]],[[1,2],[-1,3]],[[1,11],[2,3]],[[NaN,2],[2,3]]]) assert.throws(()=>summarizeCheckpoint(2,a,b));
});

test('HW4: homepage has one homework card; landing has exactly two standalone exercises', async () => {
  const home=await read('docs/index.html'), landing=await read('docs/homework-4/index.html');
  assert.equal([...home.matchAll(/href="\.\/homework-4\/"/g)].length,1);
  assert.doesNotMatch(home,/href="[^"\n]*exercise-[12]/);
  assert.equal([...landing.matchAll(/class="homework-card"/g)].length,2);
  for (const exercise of [1,2]) {
    assert.ok(landing.includes(`href="./exercise-${exercise}/"`));
    const page=await read(`docs/homework-4/exercise-${exercise}/index.html`);
    assert.match(page,/href="\.\.\/">/); assert.equal([...page.matchAll(/class="section-number"/g)].length,4);
  }
});

test('HW4: all chart inputs originate from the one simulation result and source excerpts resolve', async () => {
  const app=await read('docs/homework-4/exercise-2/js/app.js');
  assert.match(app,/renderTrajectories\(byId\('trajectory-chart'\), result, metric.value\)/);
  assert.match(app,/renderVariability\(byId\('mean-variability-chart'\), result.snapshots, 'mean'\)/);
  assert.match(app,/histogram\(snapshot.sampleMeans\)/); assert.match(app,/histogram\(snapshot.sampleVariances\)/);
  assert.doesNotMatch(app,/Math\.random|sampleScore|generateTrajectory/);
  for (const region of ['sampling-theory','across-hacker-statistics']) assert.ok(extractCodeRegion(await read('docs/homework-4/exercise-2/js/statistics.js'),region).length>0);
  for (const region of ['hacker-trajectory','sampling-experiment']) assert.ok(extractCodeRegion(await read('docs/homework-4/exercise-2/js/simulation.js'),region).length>0);
});
