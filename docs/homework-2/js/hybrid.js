import { N, G, scalarMultiply, validatePrivateScalar, validatePublicPoint, serializePoint, deserializePoint, recoverPrivateKey } from './ecc.js';

export const MAX_MESSAGE_BYTES = 4096;
const encoder = new TextEncoder();
const DOMAIN = 'statistics-msc/homework-2/ecdh-hkdf-sha256-aes256gcm/v1';

export function requireWebCrypto(provider = globalThis.crypto) {
  if (!provider || typeof provider.getRandomValues !== 'function' || !provider.subtle
      || ['importKey', 'deriveKey', 'encrypt', 'decrypt'].some(name => typeof provider.subtle[name] !== 'function')) {
    throw new Error('Web Crypto is unavailable. Open this page over HTTPS or localhost in a compatible browser.');
  }
  return provider;
}

export function bytesToHex(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected bytes.');
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(text) {
  if (typeof text !== 'string' || text.length % 2 || !/^[0-9a-f]*$/.test(text)) throw new TypeError('Expected canonical lowercase hexadecimal bytes.');
  return Uint8Array.from(text.match(/../g) ?? [], byte => parseInt(byte, 16));
}

/** Empty text is supported; malformed UTF-16 is rejected to ensure an exact UTF-8 round trip. */
export function encodeMessage(message) {
  if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES
      || [...message].some(character => character.codePointAt(0) >= 0xd800 && character.codePointAt(0) <= 0xdfff)) {
    throw new RangeError('Use well-formed Unicode text of at most 4,096 UTF-8 bytes.');
  }
  const bytes = encoder.encode(message);
  if (bytes.length > MAX_MESSAGE_BYTES) throw new RangeError('The message exceeds 4,096 UTF-8 bytes.');
  return bytes;
}

/** Uniform rejection sampling over 1..n−1 using 256 secure random bits. */
export function randomScalar(provider = globalThis.crypto) {
  requireWebCrypto(provider);
  for (let attempt = 0; attempt < 1024; attempt += 1) {
    const candidate = BigInt(`0x${bytesToHex(provider.getRandomValues(new Uint8Array(32)))}`);
    if (candidate > 0n && candidate < N) return candidate;
  }
  throw new Error('The random source repeatedly produced invalid scalars.');
}

function concatenate(...parts) {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

async function deriveKey(shared, recipient, ephemeral, salt, provider) {
  const material = await provider.subtle.importKey('raw', hexToBytes(serializePoint(shared)), 'HKDF', false, ['deriveKey']);
  // Fixed-width points bind the derivation to both public keys; the label fixes this protocol/version.
  const info = concatenate(encoder.encode(DOMAIN), hexToBytes(serializePoint(ephemeral)), hexToBytes(serializePoint(recipient)));
  return provider.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function authenticatedHeader(recipient, ephemeral, salt, iv) {
  return concatenate(encoder.encode(DOMAIN), hexToBytes(serializePoint(ephemeral)), hexToBytes(serializePoint(recipient)), salt, iv);
}

export function validatePayload(payload) {
  const keys = ['version', 'ephemeralPublicKey', 'salt', 'iv', 'ciphertext'];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || Object.keys(payload).length !== keys.length || keys.some(key => !Object.hasOwn(payload, key)) || payload.version !== 1) {
    throw new TypeError('Invalid ciphertext payload or unsupported version.');
  }
  const ephemeral = deserializePoint(payload.ephemeralPublicKey);
  for (const [field, length] of [['salt', 64], ['iv', 24]]) {
    if (typeof payload[field] !== 'string' || payload[field].length !== length) throw new TypeError(`Invalid ${field} length.`);
  }
  if (typeof payload.ciphertext !== 'string' || payload.ciphertext.length < 32 || payload.ciphertext.length > 2 * (MAX_MESSAGE_BYTES + 16)) {
    throw new TypeError('Invalid authenticated ciphertext length.');
  }
  return { ephemeral, salt: hexToBytes(payload.salt), iv: hexToBytes(payload.iv), ciphertext: hexToBytes(payload.ciphertext) };
}

// #region hybrid-encryption
/** Public-key encryption. The optional provider permits isolated deterministic
 * tests; the webpage always uses the native cryptographic random source. */
export async function encryptMessage(message, recipient, provider = globalThis.crypto) {
  requireWebCrypto(provider);
  validatePublicPoint(recipient);
  const plaintext = encodeMessage(message);
  const r = randomScalar(provider); // full 1..n−1 domain, never returned
  const ephemeral = scalarMultiply(G, r);
  const shared = scalarMultiply(recipient, r);
  const salt = provider.getRandomValues(new Uint8Array(32));
  const iv = provider.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(shared, recipient, ephemeral, salt, provider);
  const ciphertext = await provider.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128,
    additionalData: authenticatedHeader(recipient, ephemeral, salt, iv) }, key, plaintext);
  return { version: 1, ephemeralPublicKey: serializePoint(ephemeral), salt: bytesToHex(salt),
    iv: bytesToHex(iv), ciphertext: bytesToHex(new Uint8Array(ciphertext)) };
}

export async function decryptMessage(payload, privateKey, provider = globalThis.crypto) {
  requireWebCrypto(provider);
  validatePrivateScalar(privateKey);
  const { ephemeral, salt, iv, ciphertext } = validatePayload(payload);
  const recipient = scalarMultiply(G, privateKey);
  const shared = scalarMultiply(ephemeral, privateKey);
  const key = await deriveKey(shared, recipient, ephemeral, salt, provider);
  let plaintext;
  try {
    plaintext = await provider.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128,
      additionalData: authenticatedHeader(recipient, ephemeral, salt, iv) }, key, ciphertext);
  } catch {
    throw new Error('Authentication failed: the private key or ciphertext is incorrect.');
  }
  // A leading U+FEFF is message content, not a file marker to discard.
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(plaintext);
}
// #endregion hybrid-encryption

/** The attacker receives Q, K, and the intercepted public payload, never d. */
export async function attackCiphertext(publicPoint, keySpace, payload, provider = globalThis.crypto) {
  validatePayload(payload);
  const result = await recoverPrivateKey(publicPoint, keySpace);
  if (!result.matched) return { ...result, plaintext: null };
  return { ...result, plaintext: await decryptMessage(payload, result.privateKey, provider) };
}
