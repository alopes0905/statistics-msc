/** Mutable accumulator with no retained observations; functions have no I/O. */
export function createWelford() {
  return { count: 0, mean: 0, M2: 0 };
}

function validateState(state) {
  if (!state || !Number.isSafeInteger(state.count) || state.count < 0 ||
      !Number.isFinite(state.mean) || !Number.isFinite(state.M2) || state.M2 < 0 ||
      (state.count === 0 && (state.mean !== 0 || state.M2 !== 0))) {
    throw new TypeError('A valid Welford accumulator is required.');
  }
}

/** Update in constant memory. Invalid/overflowing updates leave state intact. */
export function updateWelford(state, x) {
  validateState(state);
  if (!Number.isFinite(x)) throw new TypeError('Each observation must be a finite number.');
  if (state.count === Number.MAX_SAFE_INTEGER) throw new RangeError('Sample count exceeds exact integer precision.');
  let { count, mean, M2 } = state;

// #region welford-update
  const delta = x - mean;
  mean += delta / ++count;
  M2 += delta * (x - mean);
// #endregion welford-update

  if (!Number.isFinite(mean) || !Number.isFinite(M2) || M2 < 0) {
    throw new RangeError('The update exceeds finite floating-point precision.');
  }
  Object.assign(state, { count, mean, M2 });
  return state;
}

// #region welford-statistics
/** null denotes an undefined statistic, never an invented zero variance. */
export function getWelfordStatistics(state) {
  validateState(state);
  return {
    count: state.count,
    mean: state.count === 0 ? null : state.mean,
    SS: state.M2,
    sampleVariance: state.count < 2 ? null : state.M2 / (state.count - 1),
    descriptiveVariance: state.count === 0 ? null : state.M2 / state.count,
  };
}
// #endregion welford-statistics
