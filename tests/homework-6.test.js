import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LIMITS, PRESETS, parseCategoricalCSV, buildContingencyTable } from '../docs/homework-6/js/dataset.js';
import { computeFrequencies, computePearson, checkExpectedCounts, analyzeIndependence, testDecision, interpretation, formatP } from '../docs/homework-6/js/statistics.js';
import { logGamma, regularizedGammaQ, chiSquareSurvival } from '../docs/homework-6/js/chi-square.js';
import { conditionalChart } from '../docs/homework-6/js/charts.js';
import { normalCDF } from '../docs/homework-5/exercise-2/js/normal-cdf.js';
import { extractCodeRegion } from '../docs/assets/js/code-viewer.js';
import { scanHTML } from '../tools/check.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const analyze = (preset = 'cybersecurity', alpha = 0.05) => analyzeIndependence(parseCategoricalCSV(PRESETS[preset]), alpha);
const close = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
const relative = (actual, expected, tolerance = 3e-12) => assert.ok(Math.abs((actual - expected) / expected) <= tolerance, `${actual} ≠ ${expected} relatively`);
const total = values => values.reduce((a, b) => a + b, 0);
const fromMatrix = matrix => matrix.flatMap((row, i) => row.map((count, j) => ({ X: `R${i}`, F: `C${j}`, count })));

test('HW6 parses raw records, duplicate pairs and weighted CSV equivalently', () => {
  const raw = parseCategoricalCSV('X,F\nA,Yes\nA,Yes\nA,No\nB,Yes\nB,No');
  const weighted = parseCategoricalCSV('X,F,Count\nA,Yes,2\nA,No,1\nB,Yes,1\nB,No,1');
  assert.deepEqual(buildContingencyTable(raw), buildContingencyTable(weighted));
  assert.deepEqual(buildContingencyTable(raw).observed, [[2, 1], [1, 1]]);
});

test('HW6 CSV supports BOM, CRLF, quoted commas, escaped quotes, newlines and Unicode', () => {
  const rows = parseCategoricalCSV('\uFEFFX,F,Count\r\n"配置, A","yes ""OK""",2\r\n"配置\nB",否,1\r\n');
  assert.deepEqual(rows, [{ X: '配置, A', F: 'yes "OK"', count: 2 }, { X: '配置\nB', F: '否', count: 1 }]);
  assert.deepEqual(parseCategoricalCSV('\nX,F\n\n A , Yes \n\n'), [{ X: ' A ', F: ' Yes ', count: 1 }]);
});

test('HW6 rejects malformed CSV, headers, missing columns and empty input', () => {
  for (const csv of ['', '\n', 'A,B\na,b', 'X,F', 'X,F,Other\na,b,1', 'X,F\na', 'X,F\na,b,c', 'X,F\n"a,b', 'X,F\na"x,b', 'X,F\n"a"x,b', 'X,F\n"a" ,b', 'X,F\n""', 'X,F\na,\u0000']) {
    assert.throws(() => parseCategoricalCSV(csv), RangeError, csv);
  }
});

test('HW6 rejects negative, noninteger, nondecimal and unsafe CSV counts', () => {
  for (const count of ['-1', '1.2', 'NaN', 'Infinity', '1e2', '0x10', '', '9007199254740992']) assert.throws(() => parseCategoricalCSV(`X,F,Count\na,b,${count}`), /Count/);
  assert.equal(parseCategoricalCSV('X,F,Count\na,b,0002')[0].count, 2);
});

test('HW6 keeps zero cells, first-appearance order, numeric and prototype-like labels', () => {
  const table = buildContingencyTable([{ X: '__proto__', F: 'constructor', count: 0 }, { X: 2, F: 1, count: 3 }, { X: '__proto__', F: 'constructor', count: 5 }]);
  assert.deepEqual(table.rows, ['__proto__', '2']); assert.deepEqual(table.columns, ['constructor', '1']);
  assert.deepEqual(table.observed, [[5, 0], [0, 3]]);
  assert.equal(table.N, 8);
});

test('HW6 validates dimensions, zero margins, labels, finite/safe counts and totals', () => {
  const good = fromMatrix([[1, 0], [0, 1]]);
  for (const bad of [[], null, [{ X: 'A', F: 'Y' }], fromMatrix([[0, 0], [0, 0]]), fromMatrix([[0, 0], [1, 1]]), fromMatrix([[1, 0], [1, 0]])]) assert.throws(() => buildContingencyTable(bad), RangeError);
  for (const value of ['', '   ', undefined, null, NaN, Infinity, {}, 'x'.repeat(101)]) assert.throws(() => buildContingencyTable([...good, { X: value, F: 'C0' }]), RangeError);
  for (const value of [-1, 0.5, NaN, Infinity, '2', null, undefined, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => buildContingencyTable([...good, { X: 'R0', F: 'C0', count: value }]), RangeError);
  assert.throws(() => buildContingencyTable([...good, { X: 'R0', F: 'C0', count: Number.MAX_SAFE_INTEGER }]), /safe/);
});

test('HW6 enforces bounded characters, records and category cardinality', () => {
  assert.throws(() => parseCategoricalCSV('x'.repeat(LIMITS.characters + 1)), /characters/);
  assert.throws(() => parseCategoricalCSV(`X,F\n${'a,b\n'.repeat(LIMITS.records + 1)}`), /records/);
  assert.throws(() => buildContingencyTable(Array(LIMITS.records + 1).fill({ X: 'a', F: 'b' })), /records/);
  assert.throws(() => buildContingencyTable(Array.from({ length: 21 }, (_, i) => ({ X: `${i}`, F: `${i % 2}` }))), /categories/);
  assert.throws(() => buildContingencyTable(Array.from({ length: 21 }, (_, i) => ({ X: `${i % 2}`, F: `${i}` }))), /categories/);
});

test('HW6 default contingency table, margins and grand total match the hand fixture', () => {
  const { table } = analyze();
  assert.deepEqual(table.rows, ['Basic', 'Intermediate', 'Advanced']); assert.deepEqual(table.columns, ['Success', 'Failure']);
  assert.deepEqual(table.observed, [[30, 10], [20, 20], [10, 30]]);
  assert.deepEqual(table.rowTotals, [40, 40, 40]); assert.deepEqual(table.columnTotals, [60, 60]); assert.equal(table.N, 120);
});

test('HW6 joint/marginal distributions and both conditioning directions use correct denominators', () => {
  const { table, frequencies: f } = analyze();
  assert.deepEqual(f.FgivenX, [[0.75, 0.25], [0.5, 0.5], [0.25, 0.75]]);
  assert.deepEqual(f.XgivenF, [[0.5, 1 / 6], [1 / 3, 1 / 3], [1 / 6, 0.5]]);
  assert.deepEqual(f.marginalX, [1 / 3, 1 / 3, 1 / 3]); assert.deepEqual(f.marginalF, [0.5, 0.5]);
  close(total(f.joint.flat()), 1); close(total(f.marginalX), 1); close(total(f.marginalF), 1);
  f.FgivenX.forEach(row => close(total(row), 1));
  table.columns.forEach((_, j) => close(total(f.XgivenF.map(row => row[j])), 1));
  assert.deepEqual(f.joint, [[1 / 4, 1 / 12], [1 / 6, 1 / 6], [1 / 12, 1 / 4]]);
});

test('HW6 unequal margins expose reversed-conditioning mistakes', () => {
  const table = buildContingencyTable(fromMatrix([[2, 4], [3, 1]])), f = computeFrequencies(table);
  close(f.FgivenX[0][0], 1 / 3); close(f.XgivenF[0][0], 0.4);
  assert.deepEqual(table.columnTotals, [5, 5]); assert.deepEqual(table.rowTotals, [6, 4]);
});

test('HW6 default expected counts, contributions, signed residuals, df and V are correct', () => {
  const result = analyze();
  assert.deepEqual(result.expected, [[20, 20], [20, 20], [20, 20]]);
  assert.deepEqual(result.contributions, [[5, 5], [0, 0], [5, 5]]);
  assert.equal(result.statistic, 20); assert.equal(result.df, 2);
  close(result.residuals[0][0], Math.sqrt(5)); close(result.residuals[0][1], -Math.sqrt(5));
  close(result.V, 0.408248290463863);
  relative(result.p.value, 0.00004539992976248485, 1e-15);
  assert.equal(result.p.logValue, -10); assert.equal(result.marginsVerified, true);
});

test('HW6 expected row, column and grand totals hold for a nonuniform 3×3 table', () => {
  const t = buildContingencyTable(fromMatrix([[4, 9, 2], [12, 3, 9], [8, 10, 5]])), result = computePearson(t);
  result.expected.forEach((row, i) => close(total(row), t.rowTotals[i]));
  t.columns.forEach((_, j) => close(total(result.expected.map(row => row[j])), t.columnTotals[j]));
  close(total(result.expected.flat()), t.N);
  close(result.expected[0][0], 180 / 31); // 15 × 24 / 62, independent rational fixture.
});

test('HW6 exactly independent sample gives χ²=0, p=1, V=0 without proving population independence', () => {
  const result = analyze('independent');
  assert.deepEqual(result.expected, result.table.observed); assert.equal(result.statistic, 0); assert.equal(result.p.value, 1); assert.equal(result.V, 0);
  assert.equal(result.decision.reject, false); assert.match(interpretation(result), /matches.*exactly/); assert.match(interpretation(result), /Fail to reject/);
  assert.match(interpretation(result), /does not prove population independence/);
});

test('HW6 sparse cells retain valid statistics but qualify inferential conclusions', () => {
  const result = analyze('sparse');
  assert.deepEqual(result.expected, [[0.5, 0.5], [0.5, 0.5]]); assert.equal(result.statistic, 2); assert.equal(result.V, 1);
  assert.deepEqual(result.diagnostics, { minimum: 0.5, cells: 4, below5: 4, percentBelow5: 100, below1: 4, allAtLeast5: false, broaderGuidance: false });
  assert.equal(result.decision.qualified, true); assert.match(interpretation(result), /potentially unreliable/); assert.match(interpretation(result), /Fisher/);
  assert.doesNotMatch(interpretation(result), /Reject H₀:/);
});

test('HW6 diagnostics distinguish strict policy, broader 80% guidance, and threshold boundaries', () => {
  assert.equal(checkExpectedCounts([[5, 5], [5, 5]]).allAtLeast5, true);
  const broad = checkExpectedCounts([[1, 5, 5, 5, 5]]);
  assert.equal(broad.broaderGuidance, true); assert.equal(broad.allAtLeast5, false);
  assert.equal(checkExpectedCounts([[0.999, 5, 5, 5, 5]]).broaderGuidance, false);
  assert.equal(checkExpectedCounts([[4, 4, 5, 5, 5]]).broaderGuidance, false);
  for (const expected of [[], [[0]], [[-1]], [[NaN]], [[Infinity]]]) assert.throws(() => checkExpectedCounts(expected), RangeError);
});

test('HW6 V is invariant to replication, while statistical evidence increases', () => {
  const records = parseCategoricalCSV(PRESETS.cybersecurity), original = analyzeIndependence(records);
  const twice = analyzeIndependence(records.map(row => ({ ...row, count: row.count * 2 })));
  assert.equal(twice.V, original.V); assert.equal(twice.statistic, 40); assert.ok(twice.p.value < original.p.value);
  assert.deepEqual(records, parseCategoricalCSV(PRESETS.cybersecurity));
});

test('HW6 perfect association remains within V bounds, including a 20×20 table', () => {
  const result = analyzeIndependence(fromMatrix(Array.from({ length: 20 }, (_, i) => Array.from({ length: 20 }, (_, j) => i === j ? 100 : 0))));
  close(result.V, 1); assert.equal(result.df, 361); assert.equal(result.statistic, 38000);
  assert.equal(result.p.underflow, true); assert.match(formatP(result.p), /^</);
});

test('HW6 safely handles large integer totals without forming an unsafe integer product', () => {
  const n = 2 ** 49, result = analyzeIndependence(fromMatrix([[n, n], [n, n]]));
  assert.equal(result.table.N, 2 ** 51); assert.equal(result.statistic, 0); assert.equal(result.p.value, 1);
  assert.ok(result.expected.flat().every(Number.isFinite));
});

test('HW6 logGamma is checked against factorial and half-integer identities', () => {
  close(logGamma(0.5), Math.log(Math.sqrt(Math.PI)), 2e-14);
  close(logGamma(1), 0, 2e-14); close(logGamma(2), 0, 2e-14);
  close(logGamma(5), Math.log(24), 2e-14);
  // Pairwise summation avoids letting the independent factorial reference accumulate error.
  const pairSum = values => values.length < 2 ? (values[0] ?? 0) : pairSum(values.slice(0, values.length >> 1)) + pairSum(values.slice(values.length >> 1));
  for (let n = 2; n <= 500; n++) close(logGamma(n), pairSum(Array.from({ length: n - 1 }, (_, k) => Math.log(k + 1))), 4e-12);
});

test('HW6 p-values match independently specified critical values and tail references', () => {
  // High-precision critical values are the roots of the chi-square tail at 0.05.
  for (const [df, statistic] of [[1, 3.841458820694124], [2, 5.991464547107979], [3, 7.814727903251179], [4, 9.487729036781154], [10, 18.307038053275146], [20, 31.410432844230918]]) close(chiSquareSurvival(statistic, df).value, 0.05, 2e-14);
  // df=1 is the two-sided standard-normal tail; reference retained from HW5's independent data.
  relative(chiSquareSurvival(64, 1).value, 1.2441921148543568247e-15);
  relative(chiSquareSurvival(100, 1).value, 1.5239706048321052132e-23);
  relative(chiSquareSurvival(1400, 2).value, 9.8596765437597708567e-305);
});

test('HW6 survival agrees with independent finite-sum formulas for even df', () => {
  for (const df of [2, 4, 10, 20, 100, 360, 1000]) {
    for (const x of [0.01, 1, 10, 30, 100, 400]) {
      let term = Math.exp(-x / 2), expected = term;
      for (let k = 1; k < df / 2; k++) { term *= (x / 2) / k; expected += term; }
      relative(chiSquareSurvival(x, df).value, expected);
    }
  }
});

test('HW6 odd-df tails agree with normal-tail recurrence independent of the gamma implementation', () => {
  for (const statistic of [0.01, 1, 4, 25, 64, 100]) {
    let expected = 2 * normalCDF(-Math.sqrt(statistic)).value;
    let correction = Math.sqrt(2 * statistic / Math.PI) * Math.exp(-statistic / 2);
    for (let df = 1; df <= 361; df += 2) {
      relative(chiSquareSurvival(statistic, df).value, expected);
      expected += correction; correction *= statistic / (df + 2);
    }
  }
});

test('HW6 survival is bounded and monotonically decreases, across both evaluation branches', () => {
  for (const df of [1, 2, 3, 10, 100, 361, 1000]) {
    let previous = 1;
    for (const statistic of [0, 0.001, 0.1, 1, 2, 3, 4, 10, 20, 50, 100, 400, 1000, 4000]) {
      const p = chiSquareSurvival(statistic, df);
      assert.ok(p.value >= 0 && p.value <= 1); assert.ok(p.value <= previous + 2e-14); previous = p.value;
    }
    for (const delta of [-1e-7, 0, 1e-7]) close(chiSquareSurvival(df + 2 + delta, df).value, chiSquareSurvival(df + 2, df).value, 1e-7);
  }
});

test('HW6 tiny probabilities preserve their logs and never display mathematical zero', () => {
  const p = chiSquareSurvival(2000, 2);
  assert.equal(p.value, 0); assert.equal(p.logValue, -1000); assert.equal(p.underflow, true);
  assert.match(formatP(p), /below floating-point range/);
  relative(chiSquareSurvival(1000, 2).value, Math.exp(-500), 1e-15);
});

test('HW6 rejects invalid numerical arguments and reports nonconvergence', () => {
  for (const value of [-1, NaN, Infinity, undefined, '2']) assert.throws(() => chiSquareSurvival(value, 2), RangeError);
  for (const df of [0, -1, 1.5, 1001, NaN, Infinity, '2']) assert.throws(() => chiSquareSurvival(1, df), RangeError);
  for (const value of [0, -1, NaN, Infinity, 501]) assert.throws(() => logGamma(value), RangeError);
  assert.throws(() => regularizedGammaQ(1, -1), RangeError); assert.throws(() => regularizedGammaQ(0.1, 1), RangeError);
  assert.throws(() => regularizedGammaQ(2.5, 2, 1), /converge/); assert.throws(() => regularizedGammaQ(0.5, 4, 1), /converge/);
  assert.throws(() => regularizedGammaQ(1, 2, 0), /Iteration/);
});

test('HW6 reject/fail-to-reject includes equality and recomputes only the decision for alpha', () => {
  const diagnostics = analyze().diagnostics, p = { value: 0.05, logValue: Math.log(0.05), underflow: false };
  assert.equal(testDecision(p, 0.05, diagnostics).reject, true);
  assert.equal(testDecision(p, 0.01, diagnostics).reject, false);
  assert.equal(testDecision(p, 0.1, diagnostics).reject, true);
  for (const alpha of [0, 1, NaN, Infinity, -1, '0.05']) assert.throws(() => analyze('cybersecurity', alpha), RangeError);
  const text = interpretation(analyze()); assert.match(text, /Reject H₀/); assert.match(text, /conditional on independent observational units/); assert.match(text, /does not.*establish causality/);
  assert.equal(testDecision(chiSquareSurvival(2000, 2), Number.MIN_VALUE, diagnostics).reject, true);
});

test('HW6 graph represents actual conditional distributions and escapes hostile labels', () => {
  const result = analyze(), svg = conditionalChart(result.table, result.frequencies);
  assert.match(svg, /75\.0000%/); assert.match(svg, /50\.0000%/); assert.match(svg, /25\.0000%/);
  assert.match(svg, /<pattern/); assert.match(svg, /segment-label/); assert.match(svg, /aria-labelledby/);
  const hostile = analyzeIndependence([{ X: '<script>alert(1)</script>', F: '" onload="x', count: 2 }, { X: '&<B>', F: '<foreignObject>', count: 3 }]);
  const safe = conditionalChart(hostile.table, hostile.frequencies);
  assert.doesNotMatch(safe, /<script|<foreignObject|onload="x/); assert.match(safe, /&lt;script&gt;/);
});

test('HW6 integrates one direct homepage card, four sections and actual source excerpts', async () => {
  const home = await read('docs/index.html'), page = await read('docs/homework-6/index.html'), tags = scanHTML(page);
  assert.equal([...home.matchAll(/href="\.\/homework-6\/"/g)].length, 1);
  assert.equal(tags.filter(tag => tag.attributes.get('class') === 'section-number').length, 4);
  for (const [file, region, exported] of [['dataset.js', 'contingency-table', 'buildContingencyTable'], ['statistics.js', 'pearson-test', 'computePearson'], ['chi-square.js', 'chi-square-survival', 'chiSquareSurvival']]) {
    const excerpt = extractCodeRegion(await read(`docs/homework-6/js/${file}`), region);
    assert.ok(excerpt.includes(`export function ${exported}`)); assert.ok(page.includes(`data-region="${region}"`));
  }
  const source = await read('docs/homework-6/js/app.js');
  assert.match(source, /analyzeIndependence\(parseCategoricalCSV/); assert.doesNotMatch(source, /\.innerHTML\s*=|\beval\s*\(/);
  assert.match(page, /synthetic teaching counts/); assert.match(page, /does not prove H₀/);
});
