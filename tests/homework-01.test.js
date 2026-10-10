import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INFINITY, mod, modularInverse, validateCurve, isOnCurve, negatePoint,
  addPoints, doublePoint, scalarMultiply, scalarMultiples, pointOrder,
  enumeratePoints, coordinateFrequencies, encodeBits, bitFrequencies,
  hammingDistance, pearsonCorrelation, analyzeSubgroup,
} from '../docs/homework-01/js/statistics.js';
import { parsePrivateScalar } from '../docs/homework-01/js/app.js';

const curve = Object.freeze({ a: 0, b: 7, p: 17 });
const base = Object.freeze({ x: 1, y: 5 });
// Acceptance values supplied in the implementation brief, independent of this code.
const expected = [
  { x: 1, y: 5 }, { x: 2, y: 10 }, { x: 5, y: 9 }, { x: 12, y: 1 },
  { x: 12, y: 16 }, { x: 5, y: 8 }, { x: 2, y: 7 }, { x: 1, y: 12 }, null,
];

test('modular reduction handles signs, zero, and safe-integer boundaries', () => {
  assert.equal(mod(-18, 17), 16);
  assert.equal(mod(35, 17), 1);
  assert.equal(mod(-17, 17), 0);
  assert.equal(Object.is(mod(-0, 17), -0), false);
  assert.equal(mod(Number.MAX_SAFE_INTEGER, 17), 14);
  assert.equal(mod(Number.MIN_SAFE_INTEGER, 17), 3);
  for (const bad of [NaN, Infinity, 1.5, '2', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => mod(bad, 17));
  }
  for (const bad of [0, 1, 998, 17.5]) assert.throws(() => mod(1, bad));
});

test('extended Euclid finds inverses and rejects noninvertible inputs', () => {
  assert.equal(modularInverse(10, 17), 12);
  assert.equal(modularInverse(-7, 17), 12);
  assert.equal(modularInverse(3, 8), 3);
  for (let value = 1; value < 17; value += 1) {
    assert.equal((value * modularInverse(value, 17)) % 17, 1);
  }
  for (const [value, modulus] of [[0, 17], [17, 17], [6, 9], [2, 8]]) {
    assert.throws(() => modularInverse(value, modulus), /inverse does not exist/);
  }
});

test('curve validation rejects singular, composite, and unsupported parameters', () => {
  assert.deepEqual(validateCurve({ a: -17, b: 24, p: 17 }), curve);
  for (const bad of [null, {}, { a: 0, b: 0, p: 17 }, { a: 0, b: 7, p: 15 },
    { a: 0, b: 1, p: 3 }, { a: 0, b: 7, p: 1009 }, { a: 0.5, b: 7, p: 17 },
    { a: 0, b: Number.MAX_SAFE_INTEGER + 1, p: 17 }]) {
    assert.throws(() => validateCurve(bad));
  }
  // Largest supported prime, without widening Number arithmetic silently.
  assert.deepEqual(validateCurve({ a: 996, b: 995, p: 997 }), { a: 996, b: 995, p: 997 });
});

test('point validity requires canonical coordinates and accepts the identity', () => {
  assert.equal(isOnCurve(base, curve), true);
  assert.equal(isOnCurve(INFINITY, curve), true);
  for (const point of [undefined, {}, { x: 1, y: 6 }, { x: 18, y: 5 },
    { x: -16, y: 5 }, { x: 1.5, y: 5 }, { x: '1', y: 5 }]) {
    assert.equal(isOnCurve(point, curve), false);
    assert.throws(() => addPoints(base, point, curve));
  }
});

test('addition and doubling reproduce independently supplied values', () => {
  assert.deepEqual(doublePoint(base, curve), expected[1]);
  assert.deepEqual(addPoints(expected[1], base, curve), expected[2]);
  assert.deepEqual(addPoints(expected[2], expected[2], curve), expected[5]);
  assert.deepEqual(negatePoint(base, curve), expected[7]);
  assert.equal(negatePoint(INFINITY, curve), INFINITY);
});

test('identity, inverses, and doubling with y=0 are handled without division', () => {
  assert.deepEqual(addPoints(base, INFINITY, curve), base);
  assert.deepEqual(addPoints(INFINITY, base, curve), base);
  assert.equal(addPoints(INFINITY, INFINITY, curve), INFINITY);
  assert.equal(addPoints(base, negatePoint(base, curve), curve), INFINITY);
  assert.equal(doublePoint({ x: 3, y: 0 }, curve), INFINITY);
  const copy = addPoints(INFINITY, base, curve);
  copy.x = 2;
  assert.equal(base.x, 1);
});

test('repeated addition returns every expected intermediate and respects periodicity', () => {
  assert.deepEqual(scalarMultiples(base, 9, curve), expected);
  for (let k = 1; k <= 9; k += 1) assert.deepEqual(scalarMultiply(base, k, curve), expected[k - 1]);
  assert.equal(scalarMultiply(base, 0, curve), INFINITY);
  assert.deepEqual(scalarMultiples(base, 0, curve), []);
  assert.deepEqual(scalarMultiply(base, 10, curve), base);
  assert.equal(scalarMultiply(base, 18, curve), INFINITY);
  assert.deepEqual(scalarMultiply(base, 15, curve), { x: 5, y: 8 });
  assert.deepEqual(scalarMultiples(INFINITY, 2, curve), [null, null]);
  assert.equal(pointOrder(base, curve), 9);
  assert.equal(pointOrder(INFINITY, curve), 1);
});

test('scalar arithmetic rejects malformed, negative, fractional, or excessive inputs', () => {
  for (const scalar of [-1, 1.2, NaN, Infinity, '6', null, 10_001, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => scalarMultiply(base, scalar, curve));
  }
  assert.deepEqual(scalarMultiply(base, 10_000, curve), base); // 10,000 mod 9 = 1.
});

test('private-scalar text validation rejects malformed input rather than coercing it', () => {
  assert.equal(parsePrivateScalar('6', 9), 6);
  assert.equal(parsePrivateScalar(' 6 ', 9), 6);
  for (const raw of ['', ' ', '0', '9', '-1', '2.5', '6abc', '6e0', '0x6', '+6',
    '6 7', 'NaN', 'Infinity', '9007199254740993', null, 6]) {
    assert.throws(() => parsePrivateScalar(raw, 9), /whole number from 1 to 8/);
  }
});

test('private-scalar validation respects the selected base order', () => {
  assert.equal(parsePrivateScalar('1', 2), 1);
  assert.throws(() => parsePrivateScalar('2', 2), /from 1 to 1/);
  assert.equal(parsePrivateScalar('17', 18), 17);
  assert.throws(() => parsePrivateScalar('18', 18));
  for (const order of [1, null, '9', 2.5]) assert.throws(() => parsePrivateScalar('1', order));
});

test('all 17 affine toy solutions are independently enumerated', () => {
  // Direct quadratic-residue calculation, not an output snapshot from this module.
  const solutions = [[1, 5], [1, 12], [2, 7], [2, 10], [3, 0], [5, 8], [5, 9],
    [6, 6], [6, 11], [8, 3], [8, 14], [10, 2], [10, 15], [12, 1], [12, 16],
    [15, 4], [15, 13]].map(([x, y]) => ({ x, y }));
  assert.deepEqual(enumeratePoints(curve), solutions);
  assert.equal(solutions.length + 1, 18);
});

test('the complete toy group is closed, commutative, and associative', () => {
  const points = [INFINITY, ...enumeratePoints(curve)];
  const serialized = new Set(points.map((point) => JSON.stringify(point)));
  for (const p of points) {
    for (const q of points) {
      const sum = addPoints(p, q, curve);
      assert.ok(serialized.has(JSON.stringify(sum)));
      assert.equal(isOnCurve(sum, curve), true);
      assert.deepEqual(sum, addPoints(q, p, curve));
      for (const r of points) {
        assert.deepEqual(addPoints(sum, r, curve), addPoints(p, addPoints(q, r, curve), curve));
      }
    }
  }
});

test('different bases have orders 2, 3, 6, 9, and 18', () => {
  for (const [point, order] of [[{ x: 3, y: 0 }, 2], [{ x: 5, y: 9 }, 3],
    [{ x: 8, y: 3 }, 6], [base, 9], [{ x: 6, y: 6 }, 18]]) {
    assert.equal(pointOrder(point, curve), order);
    assert.equal(scalarMultiply(point, order, curve), INFINITY);
  }
  // Independent doubling formula gives 2(6,6) = (1,5), consistent with order 18.
  assert.deepEqual(doublePoint({ x: 6, y: 6 }, curve), base);
});

test('a nonzero-a curve over a different field uses the same general group law', () => {
  const otherCurve = { a: 1, b: 1, p: 5 };
  const otherBase = { x: 0, y: 1 };
  // Hand calculation: slope at (0,1) = 1/2 = 3 mod 5, so 2G = (4,2).
  const multiples = [[0, 1], [4, 2], [2, 1], [3, 4], [3, 1], [2, 4], [4, 3], [0, 4]]
    .map(([x, y]) => ({ x, y }));
  assert.deepEqual(scalarMultiples(otherBase, 9, otherCurve), [...multiples, INFINITY]);
  assert.equal(pointOrder(otherBase, otherCurve), 9);
  assert.equal(enumeratePoints(otherCurve).length + 1, 9);
  assert.deepEqual(enumeratePoints({ a: 6, b: -4, p: 5 }), enumeratePoints(otherCurve));
});

test('point arithmetic remains exact at the supported field boundary', () => {
  const boundaryCurve = { a: -1, b: -2, p: 997 };
  const point = { x: 2, y: 2 }; // 4 = 8 - 2 - 2.
  assert.equal(isOnCurve(point, boundaryCurve), true);
  // Hand calculation: 4⁻¹=748, slope=11*748 mod 997=252.
  // x=252²-4 mod 997=689; y=252*(2-689)-2 mod 997=352.
  assert.deepEqual(doublePoint(point, boundaryCurve), { x: 689, y: 352 });
  assert.equal(isOnCurve({ x: 689, y: 352 }, boundaryCurve), true);
  assert.deepEqual(addPoints(point, INFINITY, boundaryCurve), point);
});

test('exhaustive experiment uses exactly the valid nonzero scalar domain', () => {
  const result = analyzeSubgroup(base, curve);
  assert.equal(result.order, 9);
  assert.equal(result.sampleSize, 8);
  assert.deepEqual(result.observations.map(({ k }) => k), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(result.observations.map(({ point }) => point), expected.slice(0, 8));
  assert.equal(result.distinctX, 4);
  assert.equal(result.distinctY, 8);
  assert.deepEqual(result.xFrequencies, [0, 2, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0]);
  assert.deepEqual(result.yFrequencies, [0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0, 0, 1]);
  assert.equal(result.xFrequencies.reduce((sum, count) => sum + count, 0), 8);
  assert.equal(result.yFrequencies.reduce((sum, count) => sum + count, 0), 8);
  assert.deepEqual(coordinateFrequencies([], 3), [0, 0, 0]);
  assert.throws(() => coordinateFrequencies([3], 3));
  assert.throws(() => analyzeSubgroup(INFINITY, curve));
});

test('fixed-width encodings and bit counts preserve every bit including leading zeros', () => {
  assert.equal(encodeBits(1, 5), '00001');
  assert.equal(encodeBits(16, 5), '10000');
  assert.equal(encodeBits(0, 5), '00000');
  for (const [value, width] of [[32, 5], [-1, 5], [1.5, 5], [1, 0], [1, 17]]) {
    assert.throws(() => encodeBits(value, width));
  }
  const result = analyzeSubgroup(base, curve);
  assert.equal(result.width, 5);
  assert.equal(result.observations[0].encoding, '0000100101');
  assert.deepEqual(result.xBits.map(({ ones }) => ones), [0, 2, 4, 2, 4]);
  assert.deepEqual(result.yBits.map(({ ones }) => ones), [1, 4, 3, 2, 4]);
  for (const count of [...result.xBits, ...result.yBits]) assert.equal(count.zeros + count.ones, 8);
  assert.deepEqual(bitFrequencies([], 2), [{ zeros: 0, ones: 0 }, { zeros: 0, ones: 0 }]);
});

test('adjacent Hamming distances use x||y and exclude the domain boundary', () => {
  assert.equal(hammingDistance('00000', '10001'), 2);
  assert.equal(hammingDistance('01100', '01100'), 0);
  for (const pair of [['', ''], ['0', '00'], ['1x', '10'], [1, '1']]) {
    assert.throws(() => hammingDistance(...pair));
  }
  const result = analyzeSubgroup(base, curve);
  assert.deepEqual(result.adjacentChanges.map(({ distance }) => distance), [6, 5, 3, 2, 4, 7, 5]);
  assert.deepEqual(result.adjacentChanges.map(({ from, to }) => [from, to]),
    [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]]);
});

test('Pearson correlation is descriptive and handles zero variance or insufficient data', () => {
  assert.equal(pearsonCorrelation([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(pearsonCorrelation([1, 2, 3], [6, 4, 2]), -1);
  assert.equal(pearsonCorrelation([1, 2, 3], [1, 0, 1]), 0);
  for (const [left, right] of [[[], []], [[1], [2]], [[1, 1], [1, 2]], [[1, 2], [3, 3]]]) {
    assert.equal(pearsonCorrelation(left, right), null);
  }
  for (const [left, right] of [[[1], []], [[NaN], [1]], [[1.5], [1]], [[10001], [1]]]) {
    assert.throws(() => pearsonCorrelation(left, right));
  }
  const result = analyzeSubgroup(base, curve);
  assert.equal(result.correlationX, 0); // Symmetric x-values around k = 4.5.
  // Hand sums: centered k²=42, centered y²=142, centered ky=23.
  // Half-integer means make these sums exact; the final sqrt/division is rounded.
  assert.ok(Math.abs(result.correlationY - 23 / Math.sqrt(5964)) <= 2 * Number.EPSILON);
});

test('base changes recompute domains and statistics, including degenerate subgroups', () => {
  const small = analyzeSubgroup({ x: 3, y: 0 }, curve);
  assert.equal(small.order, 2);
  assert.equal(small.sampleSize, 1);
  assert.deepEqual(small.observations.map(({ k }) => k), [1]);
  assert.equal(small.correlationX, null);
  assert.equal(small.correlationY, null);
  assert.deepEqual(small.adjacentChanges, []);
  const three = analyzeSubgroup({ x: 5, y: 9 }, curve);
  assert.equal(three.sampleSize, 2);
  assert.equal(three.correlationX, null); // Both x-coordinates are 5.
  assert.equal(three.correlationY, -1);
  const full = analyzeSubgroup({ x: 6, y: 6 }, curve);
  assert.equal(full.order, 18);
  assert.equal(full.sampleSize, 17);
  assert.equal(new Set(full.observations.map(({ point }) => JSON.stringify(point))).size, 17);
  assert.equal(full.xFrequencies[3], 1); // Self-inverse point (3,0).
  const permuted = analyzeSubgroup({ x: 2, y: 10 }, curve); // 2G, gcd(2,9)=1.
  const original = analyzeSubgroup(base, curve);
  assert.equal(permuted.order, 9);
  for (const key of ['xFrequencies', 'yFrequencies', 'xBits', 'yBits']) {
    assert.deepEqual(permuted[key], original[key]);
  }
  assert.notDeepEqual(permuted.observations, original.observations);
  assert.notDeepEqual(permuted.adjacentChanges, original.adjacentChanges);
});
