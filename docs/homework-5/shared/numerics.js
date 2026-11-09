export function integer(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

/** Compensated summation; no rounding of intermediate results. */
export function sum(values) {
  let total = 0, correction = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) throw new RangeError('A numerical calculation produced a nonfinite value.');
    const adjusted = value - correction, next = total + adjusted;
    correction = (next - total) - adjusted; total = next;
  }
  if (!Number.isFinite(total)) throw new RangeError('The numerical sum overflowed.');
  return total;
}

/** Warmed, bounded batches. Times are per call, not for the whole batch.
 * The clock is injectable for tests; the browser uses performance.now(). */
export function benchmark(calculate, clock = () => performance.now()) {
  calculate(); calculate();
  let repetitions = 1;
  while (repetitions < 256) {
    const start = clock();
    for (let i = 0; i < repetitions; i += 1) calculate();
    if (clock() - start >= 2) break;
    repetitions *= 2;
  }
  const samples = [];
  for (let trial = 0; trial < 5; trial += 1) {
    const start = clock();
    for (let i = 0; i < repetitions; i += 1) calculate();
    const elapsed = clock() - start;
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('A monotonic finite timing clock is required.');
    samples.push(elapsed / repetitions);
  }
  samples.sort((a, b) => a - b);
  return { medianMs: samples[2], repetitions, batches: 5 };
}
