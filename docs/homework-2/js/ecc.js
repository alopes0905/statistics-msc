/** Educational secp256k1 arithmetic (SEC 2 §2.4.1). BigInt, affine points;
 * null is the identity. This readable implementation is not constant-time. */
export const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
export const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
export const G = Object.freeze({
  x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
});
export const INFINITY = null;
export const MAX_KEY_SPACE = 4096;

export function mod(value, modulus = P) {
  if (typeof value !== 'bigint' || typeof modulus !== 'bigint' || modulus < 2n) {
    throw new TypeError('Modular arithmetic requires BigInts and a modulus of at least two.');
  }
  return ((value % modulus) + modulus) % modulus;
}

export function inverse(value, modulus = P) {
  let a = mod(value, modulus), b = modulus, x = 1n, y = 0n;
  while (a !== 0n) {
    const quotient = b / a;
    [b, a] = [a, b - quotient * a];
    [y, x] = [x, y - quotient * x];
  }
  if (b !== 1n) throw new RangeError('The modular inverse does not exist.');
  return mod(y, modulus);
}

export function isOnCurve(point) {
  return point === INFINITY || !!(point && typeof point.x === 'bigint' && typeof point.y === 'bigint'
    && point.x >= 0n && point.x < P && point.y >= 0n && point.y < P
    && mod(point.y * point.y) === mod(point.x ** 3n + 7n));
}

export function validatePublicPoint(point) {
  // secp256k1 has cofactor one: every nonidentity curve point is in its prime-order group.
  if (point === INFINITY || !isOnCurve(point)) throw new RangeError('A valid nonidentity secp256k1 point is required.');
  return point;
}

export function validatePrivateScalar(scalar) {
  if (typeof scalar !== 'bigint' || scalar < 1n || scalar >= N) {
    throw new RangeError('A private scalar must be a BigInt from 1 through n − 1.');
  }
  return scalar;
}

export function equalPoints(left, right) {
  if (!isOnCurve(left) || !isOnCurve(right)) throw new RangeError('Invalid curve point.');
  return left === INFINITY || right === INFINITY ? left === right : left.x === right.x && left.y === right.y;
}

export function negatePoint(point) {
  if (!isOnCurve(point)) throw new RangeError('Invalid curve point.');
  return point === INFINITY ? INFINITY : { x: point.x, y: mod(-point.y) };
}

export function addPoints(left, right) {
  if (!isOnCurve(left) || !isOnCurve(right)) throw new RangeError('Invalid curve point.');
  if (left === INFINITY) return right === INFINITY ? INFINITY : { ...right };
  if (right === INFINITY) return { ...left };
  if (left.x === right.x && mod(left.y + right.y) === 0n) return INFINITY;
  const slope = left.x === right.x
    ? mod(3n * left.x * left.x * inverse(2n * left.y))
    : mod((right.y - left.y) * inverse(right.x - left.x));
  const x = mod(slope * slope - left.x - right.x);
  return { x, y: mod(slope * (left.x - x) - left.y) };
}

export function doublePoint(point) { return addPoints(point, point); }

/** Double-and-add, O(log k) group operations; 0..n permitted for group tests.
 * Secret-key APIs separately enforce 1..n−1. No inputs are mutated. */
export function scalarMultiply(point, scalar) {
  if (!isOnCurve(point)) throw new RangeError('Invalid curve point.');
  if (typeof scalar !== 'bigint' || scalar < 0n || scalar > N) throw new RangeError('Scalar must be a BigInt in 0..n.');
  let result = INFINITY, addend = point, remaining = scalar;
  while (remaining > 0n) {
    if (remaining & 1n) result = addPoints(result, addend);
    remaining >>= 1n;
    if (remaining > 0n) addend = doublePoint(addend);
  }
  return result;
}

/** SEC 1 uncompressed form: 04 || x[32 bytes] || y[32 bytes], lowercase hex. */
export function serializePoint(point) {
  validatePublicPoint(point);
  return `04${point.x.toString(16).padStart(64, '0')}${point.y.toString(16).padStart(64, '0')}`;
}

export function deserializePoint(encoded) {
  if (typeof encoded !== 'string' || !/^04[0-9a-f]{128}$/.test(encoded)) {
    throw new TypeError('Expected a canonical 65-byte uncompressed point in lowercase hex.');
  }
  return validatePublicPoint({ x: BigInt(`0x${encoded.slice(2, 66)}`), y: BigInt(`0x${encoded.slice(66)}`) });
}

export function validateKeySpace(size) {
  if (!Number.isInteger(size) || size < 1 || size > MAX_KEY_SPACE) {
    throw new RangeError(`The educational key-space size must be an integer from 1 to ${MAX_KEY_SPACE}.`);
  }
  return size;
}

// #region restricted-search
/** Public inputs only. Enumerate G, 2G, ... KG; yield every 64 candidates.
 * A match is exact, not statistical. The bound limits browser work. */
export async function recoverPrivateKey(publicPoint, keySpace) {
  validatePublicPoint(publicPoint);
  validateKeySpace(keySpace);
  let candidatePoint = INFINITY;
  for (let candidate = 1; candidate <= keySpace; candidate += 1) {
    candidatePoint = addPoints(candidatePoint, G);
    if (equalPoints(candidatePoint, publicPoint)) {
      return { privateKey: BigInt(candidate), tested: candidate, matched: true };
    }
    if (candidate % 64 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { privateKey: null, tested: keySpace, matched: false };
}
// #endregion restricted-search
