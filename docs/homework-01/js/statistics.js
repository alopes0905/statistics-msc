/**
 * Pure educational arithmetic for nonsingular y² = x³ + ax + b over Fp.
 * Number domain: prime 5 <= p <= 997; safe-integer a/b reduced modulo p;
 * canonical integer coordinates 0..p-1; scalar 0..10,000.
 * The largest curve-validation intermediate is below 4e9, hence exact.
 * O is null, never an invented coordinate. Inputs are never mutated.
 * This bounded, repeated-addition implementation is not cryptographic code.
 */
export const INFINITY = null;
const MAX_MODULUS = 997;
const MAX_SCALAR = 10_000;

function integer(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
}

/** Canonical remainder; accepts any safe integer and modulus 2..997. */
export function mod(value, modulus) {
  integer(value, 'Value', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  integer(modulus, 'Modulus', 2, MAX_MODULUS);
  const remainder = value % modulus;
  return remainder === 0 ? 0 : remainder < 0 ? remainder + modulus : remainder;
}

// #region modular-inverse
/** Extended Euclid: returns value⁻¹ modulo m; rejects gcd(value, m) != 1. */
export function modularInverse(value, m) {
  let remainder = mod(value, m);
  let previousRemainder = m;
  let coefficient = 1;
  let previousCoefficient = 0;
  while (remainder !== 0) {
    const quotient = Math.floor(previousRemainder / remainder);
    [previousRemainder, remainder] =
      [remainder, previousRemainder - quotient * remainder];
    [previousCoefficient, coefficient] =
      [coefficient, previousCoefficient - quotient * coefficient];
  }
  if (previousRemainder !== 1) {
    throw new RangeError('The modular inverse does not exist.');
  }
  return mod(previousCoefficient, m);
}
// #endregion modular-inverse

/** Validate parameters, normalize coefficients, reject composite/singular curves. */
export function validateCurve(curve) {
  if (!curve || typeof curve !== 'object') throw new TypeError('A curve is required.');
  const { p } = curve;
  integer(p, 'Prime modulus', 5, MAX_MODULUS);
  for (let divisor = 2; divisor * divisor <= p; divisor += 1) {
    if (p % divisor === 0) throw new RangeError('The field modulus must be prime.');
  }
  const a = mod(curve.a, p);
  const b = mod(curve.b, p);
  if (mod(4 * a ** 3 + 27 * b ** 2, p) === 0) {
    throw new RangeError('The curve must be nonsingular.');
  }
  return { a, b, p };
}

/** O is on the curve; malformed, noncanonical, or off-curve finite points are not. */
export function isOnCurve(point, curve) {
  const { a, b, p } = validateCurve(curve);
  if (point === INFINITY) return true;
  if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y)
      || point.x < 0 || point.x >= p || point.y < 0 || point.y >= p) return false;
  return mod(point.y ** 2, p) === mod(point.x ** 3 + a * point.x + b, p);
}

function assertPoint(point, curve) {
  if (!isOnCurve(point, curve)) throw new RangeError('A valid canonical curve point is required.');
}

/** Inverse in the additive group: -(x,y) = (x,-y mod p), and -O = O. */
export function negatePoint(point, curve) {
  assertPoint(point, curve);
  return point === INFINITY ? INFINITY : { x: point.x, y: mod(-point.y, curve.p) };
}

// #region point-addition
/** Affine group law, with modular division and all exceptional cases. */
export function addPoints(left, right, curve) {
  const { a, p } = validateCurve(curve);
  assertPoint(left, curve);
  assertPoint(right, curve);
  if (left === INFINITY) return right === INFINITY ? INFINITY : { ...right };
  if (right === INFINITY) return { ...left };
  if (left.x === right.x && mod(left.y + right.y, p) === 0) {
    return INFINITY; // Inverses, including doubling when y = 0.
  }
  const doubling = left.x === right.x;
  const numerator = doubling ? 3 * left.x ** 2 + a : right.y - left.y;
  const denominator = doubling ? 2 * left.y : right.x - left.x;
  const slope = mod(numerator * modularInverse(denominator, p), p);
  const x = mod(slope ** 2 - left.x - right.x, p);
  const y = mod(slope * (left.x - x) - left.y, p);
  return { x, y };
}
// #endregion point-addition

export function doublePoint(point, curve) {
  return addPoints(point, point, curve);
}

// #region scalar-multiplication
/** Repeated addition. Return G..kG, in order; k = 0 returns an empty list. */
export function scalarMultiples(base, scalar, curve) {
  assertPoint(base, curve);
  integer(scalar, 'Scalar', 0, MAX_SCALAR);
  const steps = [];
  let current = INFINITY;
  for (let k = 1; k <= scalar; k += 1) {
    current = addPoints(current, base, curve);
    steps.push(current);
  }
  return steps;
}

export function scalarMultiply(base, scalar, curve) {
  return scalarMultiples(base, scalar, curve).at(-1) ?? INFINITY;
}
// #endregion scalar-multiplication

/** First positive n with nG = O. At most two y values per x, plus O. */
export function pointOrder(base, curve) {
  assertPoint(base, curve);
  let current = INFINITY;
  for (let n = 1; n <= 2 * curve.p + 1; n += 1) {
    current = addPoints(current, base, curve);
    if (current === INFINITY) return n;
  }
  throw new Error('No point order found within the finite-group bound.');
}

/** All affine solutions, sorted by x then y. O is excluded from this array. */
export function enumeratePoints(curve) {
  const { a, b, p } = validateCurve(curve);
  const points = [];
  for (let x = 0; x < p; x += 1) {
    const right = mod(x ** 3 + a * x + b, p);
    for (let y = 0; y < p; y += 1) {
      if (mod(y ** 2, p) === right) points.push({ x, y });
    }
  }
  return points;
}

/** Counts for every integer in 0..size-1, including absent values. */
export function coordinateFrequencies(values, size) {
  integer(size, 'Domain size', 1, MAX_MODULUS);
  const counts = Array(size).fill(0);
  for (const value of values) {
    integer(value, 'Coordinate', 0, size - 1);
    counts[value] += 1;
  }
  return counts;
}

/** Unsigned, most-significant-bit-first encoding; width 1..16, no truncation. */
export function encodeBits(value, width) {
  integer(width, 'Bit width', 1, 16);
  integer(value, 'Encoded value', 0, 2 ** width - 1);
  return value.toString(2).padStart(width, '0');
}

export function bitFrequencies(values, width) {
  encodeBits(0, width);
  const counts = Array.from({ length: width }, () => ({ zeros: 0, ones: 0 }));
  for (const value of values) {
    const bits = encodeBits(value, width);
    for (let index = 0; index < width; index += 1) {
      if (bits[index] === '1') counts[index].ones += 1;
      else counts[index].zeros += 1;
    }
  }
  return counts;
}

/** Equal-length, nonempty binary strings; count positions that differ. */
export function hammingDistance(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string'
      || !/^[01]+$/.test(left) || !/^[01]+$/.test(right) || left.length !== right.length) {
    throw new TypeError('Equal-length binary strings are required.');
  }
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

// #region correlation
/** Pearson r for paired integer arrays (<=10,000 items, |value|<=10,000).
 * Return null for fewer than two observations or zero variance.
 * Only this descriptive statistic uses approximate floating-point arithmetic.
 */
export function pearsonCorrelation(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    throw new TypeError('Paired arrays of equal length are required.');
  }
  integer(left.length, 'Sample size', 0, MAX_SCALAR);
  for (const value of [...left, ...right]) integer(value, 'Observation', -10_000, 10_000);
  if (left.length < 2) return null;
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / left.length;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / right.length;
  let product = 0;
  let squareLeft = 0;
  let squareRight = 0;
  for (let index = 0; index < left.length; index += 1) {
    const x = left[index] - meanLeft;
    const y = right[index] - meanRight;
    product += x * y;
    squareLeft += x * x;
    squareRight += y * y;
  }
  if (squareLeft === 0 || squareRight === 0) return null;
  return Math.max(-1, Math.min(1, product / Math.sqrt(squareLeft * squareRight)));
}
// #endregion correlation

/** Exhaustive experiment on exactly k = 1..ord(G)-1, with affine base G.
 * Encoding is x||y, each coordinate using bit-length(p-1) bits.
 * Neighbor pairs stay inside this domain; there is no cyclic wraparound.
 */
export function analyzeSubgroup(base, curve) {
  assertPoint(base, curve);
  if (base === INFINITY) throw new RangeError('The experiment requires an affine base point.');
  const order = pointOrder(base, curve);
  const width = (curve.p - 1).toString(2).length;
  const observations = scalarMultiples(base, order - 1, curve).map((point, index) => ({
    k: index + 1, point,
    encoding: encodeBits(point.x, width) + encodeBits(point.y, width),
  }));
  const scalars = observations.map(({ k }) => k);
  const xValues = observations.map(({ point }) => point.x);
  const yValues = observations.map(({ point }) => point.y);
  const xFrequencies = coordinateFrequencies(xValues, curve.p);
  const yFrequencies = coordinateFrequencies(yValues, curve.p);
  return {
    order, width, observations, sampleSize: observations.length,
    xFrequencies, yFrequencies,
    distinctX: xFrequencies.filter((count) => count > 0).length,
    distinctY: yFrequencies.filter((count) => count > 0).length,
    xBits: bitFrequencies(xValues, width),
    yBits: bitFrequencies(yValues, width),
    correlationX: pearsonCorrelation(scalars, xValues),
    correlationY: pearsonCorrelation(scalars, yValues),
    adjacentChanges: observations.slice(1).map((observation, index) => ({
      from: observations[index].k, to: observation.k,
      distance: hammingDistance(observations[index].encoding, observation.encoding),
    })),
  };
}
