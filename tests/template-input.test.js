import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExampleInputs } from '../templates/homework/js/app.js';

test('template input validation accepts finite decimal values with varied separators', () => {
  assert.deepEqual(validateExampleInputs(' 1, -2.5\n+.3\t4e2, 5. ', ' -1.25e-2 '), {
    values: [1, -2.5, 0.3, 400, 5], parameter: -0.0125,
  });
  assert.equal(Object.is(validateExampleInputs('-0', '0').values[0], -0), true);
});

test('empty inputs, missing values, nondecimal tokens, and nonfinite values are rejected', () => {
  for (const dataset of ['', ' ', null]) assert.throws(() => validateExampleInputs(dataset, '1'), /at least one/);
  for (const dataset of [',1', '1,', '1,,2', '1, \n,2']) assert.throws(() => validateExampleInputs(dataset, '1'), /missing/);
  for (const dataset of ['1 two', 'NaN', 'Infinity', '1e309', '0x10', '1;2', '1_000', '<img src=x>']) {
    assert.throws(() => validateExampleInputs(dataset, '1'), /finite decimal/);
  }
  for (const parameter of ['', ' ', null, 'Infinity', 'NaN', '0x10', '1e309', '1 2']) {
    assert.throws(() => validateExampleInputs('1', parameter), /parameter/);
  }
});

test('UI example size limits are enforced without silently dropping data', () => {
  assert.equal(validateExampleInputs(Array(1000).fill('1').join(' '), '0').values.length, 1000);
  assert.throws(() => validateExampleInputs(Array(1001).fill('1').join(' '), '0'), /at most/);
  assert.throws(() => validateExampleInputs('1'.repeat(100001), '0'), /too long/);
});

test('validation returns independent input structures and performs no statistical calculation', () => {
  const first = validateExampleInputs('1 2 3', '4');
  first.values.push(99);
  assert.deepEqual(validateExampleInputs('1 2 3', '4'), { values: [1, 2, 3], parameter: 4 });
  assert.deepEqual(Object.keys(first), ['values', 'parameter']);
});
