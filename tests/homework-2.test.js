import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createCipheriv, createDecipheriv, createHash, hkdfSync, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { P, N, G, INFINITY, mod, inverse, isOnCurve, validatePublicPoint, validatePrivateScalar,
  addPoints, doublePoint, negatePoint, scalarMultiply, equalPoints, serializePoint, deserializePoint,
  validateKeySpace, recoverPrivateKey } from '../docs/homework-2/js/ecc.js';
import { MAX_MESSAGE_BYTES, encodeMessage, requireWebCrypto, randomScalar, bytesToHex, hexToBytes,
  validatePayload, encryptMessage, decryptMessage, attackCiphertext } from '../docs/homework-2/js/hybrid.js';
import { caesarEncrypt, caesarDecrypt } from '../docs/homework-2/js/caesar.js';
import { countLetters, letterFrequencies, lettersOnly, chiSquare, recoverCaesar, corpusBody,
  sampleWindows, evaluateLength, loadCorpora, LENGTHS } from '../docs/homework-2/js/cryptanalysis.js';
import { extractCodeRegion } from '../docs/assets/js/code-viewer.js';
import { scanHTML } from '../tools/check.js';
import { createDevServer } from '../tools/dev-server.js';

const root = new URL('../', import.meta.url);
const scalarBytes = scalar => Buffer.from(scalar.toString(16).padStart(64, '0'), 'hex');
function opensslPoint(scalar) {
  const ecdh = createECDH('secp256k1');
  ecdh.setPrivateKey(scalarBytes(scalar));
  return ecdh.getPublicKey('hex', 'uncompressed');
}
const rawBooks = await Promise.all(['alice', 'looking-glass'].map(name => readFile(new URL(`../docs/homework-2/data/${name}.txt`, import.meta.url), 'utf8')));
const [training, heldOut] = rawBooks.map(corpusBody);
const reference = letterFrequencies(training);
const uniform = Array(26).fill(1 / 26);

test('HW2 SEC 2 parameters are authentic secp256k1, distinct from the modulo-17 curve', () => {
  assert.equal(P, 2n ** 256n - 2n ** 32n - 977n);
  assert.equal(N.toString(16), 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
  assert.equal(serializePoint(G), '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8');
  assert.ok(Object.isFrozen(G)); assert.ok(isOnCurve(G));
  assert.equal(serializePoint(G), opensslPoint(1n));
});

test('HW2 modular reduction and Euclid handle signs, exact large integers, and noninvertibility', () => {
  assert.equal(mod(-1n), P - 1n); assert.equal(mod(3n * P + 7n), 7n);
  assert.equal(inverse(10n, 17n), 12n);
  for (const value of [1n, 2n, 37n, P - 1n]) assert.equal(mod(value * inverse(value)), 1n);
  assert.throws(() => inverse(0n)); assert.throws(() => inverse(6n, 12n));
  for (const value of [1, '1', null]) assert.throws(() => mod(value));
  assert.throws(() => mod(1n, 1n));
});

test('HW2 identity, inversion, doubling, and known 2G coordinates are correct', () => {
  assert.deepEqual(addPoints(INFINITY, G), G); assert.deepEqual(addPoints(G, INFINITY), G);
  assert.equal(addPoints(INFINITY, INFINITY), INFINITY);
  assert.equal(addPoints(G, negatePoint(G)), INFINITY);
  assert.equal(doublePoint(INFINITY), INFINITY);
  assert.deepEqual(negatePoint(negatePoint(G)), G);
  const two = { x: 0xc6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5n,
    y: 0x1ae168fea63dc339a3c58419466ceaeef7f632653266d0e1236431a950cfe52an };
  assert.deepEqual(doublePoint(G), two);
  assert.equal(serializePoint(two), opensslPoint(2n));
  assert.notEqual(addPoints(G, INFINITY), G, 'No mutable point alias is returned');
});

test('HW2 scalar multiplication agrees with independent OpenSSL at small and full-sized scalars', () => {
  for (const scalar of [1n, 2n, 3n, 37n, 256n, 4096n, 0x123456789abcdef123456789abcdef123456789abcdefn, N - 1n]) {
    assert.equal(serializePoint(scalarMultiply(G, scalar)), opensslPoint(scalar));
  }
  assert.equal(scalarMultiply(G, 0n), INFINITY);
  assert.equal(scalarMultiply(G, N), INFINITY);
  assert.deepEqual(scalarMultiply(G, N - 1n), negatePoint(G));
});

test('HW2 addition is consistent for independent multiples and inputs are unchanged', () => {
  const left = scalarMultiply(G, 37n), right = scalarMultiply(G, 71n);
  const originals = [structuredClone(left), structuredClone(right)];
  assert.equal(serializePoint(addPoints(left, right)), opensslPoint(108n));
  assert.deepEqual(addPoints(left, right), addPoints(right, left));
  assert.deepEqual(addPoints(addPoints(left, right), G), addPoints(left, addPoints(right, G)));
  assert.deepEqual([left, right], originals);
});

test('HW2 private scalars and malformed/off-curve/noncanonical points are rejected', () => {
  for (const scalar of [0n, -1n, N, N + 1n, 37, '37', null]) assert.throws(() => validatePrivateScalar(scalar));
  assert.equal(validatePrivateScalar(N - 1n), N - 1n);
  for (const scalar of [-1n, N + 1n, 1, '1']) assert.throws(() => scalarMultiply(G, scalar));
  for (const point of [{ x: 0n, y: 0n }, { ...G, x: G.x + P }, { ...G, y: -G.y }, { x: 1, y: 5 }, {}, undefined]) {
    assert.equal(isOnCurve(point), false);
    assert.throws(() => addPoints(point, G)); assert.throws(() => negatePoint(point)); assert.throws(() => equalPoints(point, G));
  }
  assert.throws(() => validatePublicPoint(INFINITY)); assert.throws(() => serializePoint(INFINITY));
});

test('HW2 uncompressed serialization is fixed-width and rejects malformed ciphertext points', () => {
  for (const scalar of [1n, 2n, 37n, N - 1n]) {
    const point = scalarMultiply(G, scalar), text = serializePoint(point);
    assert.equal(text.length, 130); assert.deepEqual(deserializePoint(text), point);
  }
  for (const text of ['', '00', '02' + G.x.toString(16), serializePoint(G).toUpperCase(), serializePoint(G) + '00', '04' + '0'.repeat(128), '04' + P.toString(16) + G.y.toString(16)]) {
    assert.throws(() => deserializePoint(text));
  }
  assert.deepEqual(hexToBytes(bytesToHex(Uint8Array.of(0, 1, 255))), Uint8Array.of(0, 1, 255));
  for (const hex of ['0', '0x00', 'AA', 'gg']) assert.throws(() => hexToBytes(hex));
});

test('HW2 ECDH symmetry agrees with OpenSSL shared-secret x-coordinates', () => {
  const d = 37n, r = 0x9876543210fedcba123456789abcdef123456789n;
  const left = scalarMultiply(scalarMultiply(G, d), r), right = scalarMultiply(scalarMultiply(G, r), d);
  assert.deepEqual(left, right);
  const oracle = createECDH('secp256k1'); oracle.setPrivateKey(scalarBytes(d));
  assert.equal(left.x.toString(16).padStart(64, '0'), oracle.computeSecret(Buffer.from(opensslPoint(r), 'hex')).toString('hex'));
});

test('HW2 secure scalar sampling rejects zero and n rather than reducing biased values', () => {
  const samples = [Buffer.alloc(32), scalarBytes(N), scalarBytes(N - 1n)];
  const provider = { subtle: webcrypto.subtle, getRandomValues: bytes => { bytes.set(samples.shift()); return bytes; } };
  assert.equal(randomScalar(provider), N - 1n); assert.equal(samples.length, 0);
  assert.throws(() => randomScalar({ subtle: webcrypto.subtle, getRandomValues: bytes => bytes.fill(0) }), /random source/);
  for (let i = 0; i < 5; i += 1) assert.ok(validatePrivateScalar(randomScalar()));
});

test('HW2 missing Web Crypto fails explicitly without an insecure fallback', async () => {
  for (const provider of [null, {}, { getRandomValues() {}, subtle: {} }]) {
    assert.throws(() => requireWebCrypto(provider), /Web Crypto is unavailable/);
    await assert.rejects(encryptMessage('hello', G, provider), /Web Crypto is unavailable/);
  }
});

// Deterministic randomness exists only in this test fixture; browser code never supplies a provider.
function testProvider(r, salt, iv) {
  const queue = [scalarBytes(r), salt, iv];
  return { subtle: webcrypto.subtle, getRandomValues(bytes) {
    const next = queue.shift(); assert.equal(bytes.length, next.length); bytes.set(next); return bytes;
  } };
}

test('HW2 deterministic hybrid payload matches independent Node ECDH/HKDF/AES-GCM primitives', async () => {
  const d = 37n, r = 0x123456789abcdef123456789abcdef123456789abcdefn;
  const Q = opensslPoint(d), R = opensslPoint(r), S = opensslPoint(d * r % N);
  const salt = Buffer.from(Array.from({ length: 32 }, (_, i) => i)), iv = Buffer.from('000102030405060708090a0b', 'hex');
  const context = Buffer.from('statistics-msc/homework-2/ecdh-hkdf-sha256-aes256gcm/v1');
  const info = Buffer.concat([context, Buffer.from(R, 'hex'), Buffer.from(Q, 'hex')]);
  const key = Buffer.from(hkdfSync('sha256', Buffer.from(S, 'hex'), salt, info, 32));
  const aad = Buffer.concat([info, salt, iv]);
  const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update('MEET ME AT NOON', 'utf8'), cipher.final(), cipher.getAuthTag()]);
  const payload = await encryptMessage('MEET ME AT NOON', deserializePoint(Q), testProvider(r, salt, iv));
  assert.deepEqual(payload, { version: 1, ephemeralPublicKey: R, salt: salt.toString('hex'), iv: iv.toString('hex'), ciphertext: ciphertext.toString('hex') });
  assert.equal(await decryptMessage(payload, d), 'MEET ME AT NOON');
  const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAAD(aad); decipher.setAuthTag(ciphertext.subarray(-16));
  assert.equal(Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString(), 'MEET ME AT NOON');
});

for (const [label, message] of [['empty', ''], ['short', 'A'], ['default', 'MEET ME AT NOON'], ['UTF-8', 'Olá, κόσμε! 🔐\n日本語'], ['leading byte-order mark', '\uFEFFKeep this character'], ['maximum bytes', 'a'.repeat(MAX_MESSAGE_BYTES)]]) {
  test(`HW2 authenticated encryption round-trips ${label} text exactly`, async () => {
    const key = 37n, payload = await encryptMessage(message, scalarMultiply(G, key));
    assert.equal(await decryptMessage(JSON.parse(JSON.stringify(payload)), key), message);
    assert.equal(payload.ciphertext.length / 2, new TextEncoder().encode(message).length + 16);
    assert.deepEqual(Object.keys(payload).sort(), ['ciphertext', 'ephemeralPublicKey', 'iv', 'salt', 'version']);
  });
}

test('HW2 message bounds reject malformed Unicode and oversized UTF-8 without silent replacement', async () => {
  for (const message of ['\ud800', '\udfff', 'a'.repeat(4097), '🔐'.repeat(1025), null, 12]) {
    assert.throws(() => encodeMessage(message)); await assert.rejects(encryptMessage(message, G));
  }
  assert.equal(encodeMessage('🔐'.repeat(1024)).length, 4096);
});

test('HW2 re-encryption has fresh ephemeral points, salts, IVs, and ciphertexts', async () => {
  const Q = scalarMultiply(G, 37n), a = await encryptMessage('repeat', Q), b = await encryptMessage('repeat', Q);
  for (const field of ['ephemeralPublicKey', 'salt', 'iv', 'ciphertext']) assert.notEqual(a[field], b[field]);
  assert.equal(await decryptMessage(a, 37n), await decryptMessage(b, 37n));
});

test('HW2 tampering, a different valid ephemeral point, and the wrong private key fail authentication', async () => {
  const payload = await encryptMessage('authenticated', scalarMultiply(G, 37n));
  for (const field of ['ciphertext', 'salt', 'iv']) {
    const changed = { ...payload, [field]: (payload[field][0] === '0' ? '1' : '0') + payload[field].slice(1) };
    await assert.rejects(decryptMessage(changed, 37n), /Authentication failed/);
  }
  await assert.rejects(decryptMessage({ ...payload, ephemeralPublicKey: serializePoint(G) }, 37n), /Authentication failed/);
  await assert.rejects(decryptMessage(payload, 38n), /Authentication failed/);
  const badTag = { ...payload, ciphertext: payload.ciphertext.slice(0, -1) + (payload.ciphertext.endsWith('0') ? '1' : '0') };
  await assert.rejects(decryptMessage(badTag, 37n), /Authentication failed/);
});

test('HW2 payload validation rejects unknown versions/fields, malformed encodings, and invalid points', async () => {
  const valid = await encryptMessage('test', G);
  for (const bad of [null, [], '{}', { ...valid, version: 2 }, { ...valid, r: '1' },
    { ...valid, iv: '00' }, { ...valid, salt: 'z'.repeat(64) }, { ...valid, ciphertext: '00' },
    { ...valid, ciphertext: '0'.repeat(2 * (4096 + 17)) }, { ...valid, ciphertext: valid.ciphertext + '0' },
    { ...valid, ephemeralPublicKey: '04' + '0'.repeat(128) }]) {
    assert.throws(() => validatePayload(bad)); await assert.rejects(decryptMessage(bad, 1n));
  }
  const missing = { ...valid }; delete missing.salt; assert.throws(() => validatePayload(missing));
  assert.doesNotThrow(() => validatePayload(valid));
});

test('HW2 Caesar known examples, case, punctuation, Unicode pass-through, and all shifts', () => {
  assert.equal(caesarEncrypt('MEET ME AT NOON', 3), 'PHHW PH DW QRRQ');
  assert.equal(caesarDecrypt('PHHW PH DW QRRQ', 3), 'MEET ME AT NOON');
  assert.equal(caesarEncrypt('Az az!', 25), 'Zy zy!');
  assert.equal(caesarEncrypt('Abc, Z!', 0), 'Abc, Z!');
  assert.equal(caesarEncrypt('éßΩ🔐 aZ', 3), 'éßΩ🔐 dC');
  for (let k = 0; k < 26; k += 1) for (const text of ['', 'Hello, World! 123', 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ']) {
    assert.equal(caesarDecrypt(caesarEncrypt(text, k), k), text);
  }
});

test('HW2 Caesar rejects keys outside its explicit domain and bounds input size', () => {
  for (const key of [-1, 26, 1.5, NaN, Infinity, '3', null]) {
    assert.throws(() => caesarEncrypt('A', key)); assert.throws(() => caesarDecrypt('A', key));
  }
  for (const text of [null, 7, 'a'.repeat(20001)]) assert.throws(() => caesarEncrypt(text, 3));
});

test('HW2 ASCII counts and normalization match hand counts without Unicode case expansion', () => {
  const result = letterFrequencies('Aab! Bc éßΩ');
  assert.equal(result.total, 5); assert.deepEqual(result.counts.slice(0, 3), [2, 2, 1]);
  assert.deepEqual(result.probabilities.slice(0, 3), [0.4, 0.4, 0.2]);
  assert.equal(result.probabilities.reduce((a, b) => a + b), 1);
  assert.equal(lettersOnly('éßΩ aB!'), 'AB');
  assert.deepEqual(countLetters('123!?'), Array(26).fill(0));
  assert.throws(() => letterFrequencies('123!?'));
});

test('HW2 Pearson scores agree with independently hand-calculated examples', () => {
  assert.equal(chiSquare([10, 30], [0.5, 0.5]), 10);
  assert.equal(chiSquare([25, 75], [0.25, 0.75]), 0);
  assert.equal(chiSquare([0, 2], [0.5, 0.5]), 2);
  for (const [counts, p] of [[[0, 0], [0.5, 0.5]], [[1, -1], [0.5, 0.5]], [[1, 2], [0, 1]], [[1, 2], [0.2, 0.2]], [[1], [NaN]], [[1.5], [1]]]) assert.throws(() => chiSquare(counts, p));
});

test('HW2 ranks all shifts with a unique known distribution and no true-key argument', () => {
  const plain = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i).repeat(i + 1)).join('');
  const model = letterFrequencies(plain).probabilities;
  for (const key of [0, 3, 11, 25]) {
    const result = recoverCaesar(caesarEncrypt(plain, key), model);
    assert.equal(result.best.key, key); assert.equal(result.best.plaintext, plain);
    // Division followed by multiplication can leave ~epsilon relative error in
    // expected counts; squaring and summing bounds this score by 4*epsilon²*N.
    assert.ok(result.best.score <= 4 * Number.EPSILON ** 2 * plain.length);
    assert.equal(result.candidates.length, 26); assert.equal(new Set(result.candidates.map(item => item.key)).size, 26);
    assert.ok(result.candidates.every((item, i, list) => i === 0 || item.score >= list[i - 1].score));
    assert.equal(result.tied, false);
  }
});

test('HW2 no-letter inputs, uninformative models, and degenerate references are explicit', () => {
  for (const text of ['', '123!? éΩ']) assert.deepEqual(recoverCaesar(text, uniform), { total: 0, best: null, candidates: [], tied: false });
  const tied = recoverCaesar('ABC', uniform); assert.equal(tied.tied, true); assert.equal(tied.best.key, 0);
  assert.throws(() => recoverCaesar('ABC', Array(26).fill(0)));
  assert.throws(() => recoverCaesar('ABC', [1]));
  assert.throws(() => recoverCaesar('a'.repeat(20001), uniform));
});

test('HW2 genuine books retain publisher licenses, stable hashes, and a separate training/evaluation split', () => {
  assert.match(rawBooks[0], /Alice’s Adventures in Wonderland/); assert.match(rawBooks[1], /Through the Looking-Glass/);
  const expected = ['49a0b2726606e1290ac03a63978fa1dd1bd38a8d805704d98265f393533ea094', '24bae70935e7fce7be74357779c53861c0cd04b3687f3005c1a8687f2b909988'];
  rawBooks.forEach((raw, i) => { assert.equal(createHash('sha256').update(raw).digest('hex'), expected[i]); assert.match(raw, /FULL PROJECT GUTENBERG LICENSE/); });
  assert.equal(reference.total, 107785); assert.equal(lettersOnly(heldOut).length, 119699);
  assert.notEqual(training, heldOut); assert.ok(!training.includes(heldOut));
  assert.ok(!training.includes('FULL PROJECT GUTENBERG LICENSE'));
  assert.ok(reference.probabilities.every(p => p > 0));
  for (const raw of ['', 'an invented corpus', rawBooks[0].replace('*** START OF', 'START OF')]) assert.throws(() => corpusBody(raw));
});

test('HW2 deterministic held-out windows are nonoverlapping within each length and correctly bounded', () => {
  for (const length of LENGTHS) {
    const windows = sampleWindows(heldOut, length);
    assert.equal(windows.length, 20); assert.equal(windows[0].start, 0);
    assert.equal(windows.at(-1).start + length, 119699);
    windows.forEach((item, i) => { assert.equal(item.plaintext.length, length); if (i) assert.ok(item.start >= windows[i - 1].start + length); });
    assert.deepEqual(sampleWindows(heldOut, length), windows);
  }
  for (const args of [['ABC', 2, 2], [heldOut, 0, 20], [heldOut, 3001, 20], [heldOut, 20, 1]]) assert.throws(() => sampleWindows(...args));
});

test('HW2 real held-out English recovers all shifts; an actual short passage fails', () => {
  const plain = sampleWindows(heldOut, 300)[1].plaintext;
  for (let key = 0; key < 26; key += 1) assert.equal(recoverCaesar(caesarEncrypt(plain, key), reference.probabilities).best.key, key);
  const short = lettersOnly(heldOut).slice(62988, 63008);
  assert.equal(short, 'ATUREDANXIETYFORTHEQ');
  const failed = recoverCaesar(short, reference.probabilities);
  assert.equal(failed.best.key, 12); assert.equal(failed.best.plaintext, 'OHIFSROBLWSHMTCFHVSE');
});

test('HW2 measured accuracies are recomputed, repeatable, and agree with independently scored window histograms', () => {
  for (const length of LENGTHS) {
    const result = evaluateLength(heldOut, reference.probabilities, length);
    // Independent score loop rotates each observed histogram instead of invoking our decrypt/score functions.
    let successfulPassages = 0;
    for (const { plaintext } of sampleWindows(heldOut, length)) {
      const counts = Array(26).fill(0); for (const c of plaintext) counts[c.charCodeAt(0) - 65]++;
      const scores = Array.from({ length: 26 }, (_, k) => {
        let score = 0;
        for (let i = 0; i < 26; i++) { const e = length * reference.probabilities[i]; score += (counts[(i + k) % 26] - e) ** 2 / e; }
        return score;
      });
      if (scores[0] < Math.min(...scores.slice(1))) successfulPassages++;
    }
    assert.equal(result.trials, 520); assert.equal(result.correct, successfulPassages * 26);
    assert.equal(result.correct, length === 20 ? 494 : 520);
    assert.equal(result.accuracy, 100 * result.correct / result.trials); assert.equal(result.ambiguous, 0);
  }
  const once = evaluateLength(heldOut, reference.probabilities, 20);
  assert.deepEqual(evaluateLength(heldOut, reference.probabilities, 20), once);
  assert.throws(() => evaluateLength(heldOut, reference.probabilities, 20, 20, [1, 1]));
  assert.throws(() => evaluateLength(heldOut, reference.probabilities, 20, 20, [26]));
});

test('HW2 ambiguous outcomes count as failures rather than successful key recovery', () => {
  const result = evaluateLength('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(10), uniform, 20, 2, [0, 1]);
  assert.equal(result.trials, 4); assert.equal(result.ambiguous, 4); assert.equal(result.correct, 0); assert.equal(result.accuracy, 0);
});

for (const key of [1n, 37n, 256n, 4096n]) {
  test(`HW2 restricted-key search recovers ${key} with the exact candidate count`, async () => {
    const publicPoint = deserializePoint(opensslPoint(key));
    const result = await recoverPrivateKey(publicPoint, Number(key));
    assert.deepEqual(result, { privateKey: key, tested: Number(key), matched: true });
    assert.ok(equalPoints(scalarMultiply(G, result.privateKey), publicPoint));
  });
}

test('HW2 search rejects invalid ranges/points and fails when the key is outside the public bound', async () => {
  assert.deepEqual(await recoverPrivateKey(scalarMultiply(G, 257n), 256), { privateKey: null, tested: 256, matched: false });
  for (const bound of [0, 4097, 1.5, '256', Infinity]) {
    assert.throws(() => validateKeySpace(bound)); await assert.rejects(recoverPrivateKey(G, bound));
  }
  await assert.rejects(recoverPrivateKey(INFINITY, 256));
});

test('HW2 public-only attack recovers the key and authenticates/decrypts the intercepted message', async () => {
  const Q = deserializePoint(opensslPoint(37n)), payload = await encryptMessage('Recovered by enumeration 🔐', Q);
  const publicInputs = JSON.parse(JSON.stringify({ Q: serializePoint(Q), K: 256, payload }));
  const result = await attackCiphertext(deserializePoint(publicInputs.Q), publicInputs.K, publicInputs.payload);
  assert.equal(result.privateKey, 37n); assert.equal(result.tested, 37); assert.equal(result.plaintext, 'Recovered by enumeration 🔐');
  assert.deepEqual(await attackCiphertext(Q, 36, payload), { privateKey: null, tested: 36, matched: false, plaintext: null });
  const corrupted = { ...payload, iv: '00'.repeat(12) };
  await assert.rejects(attackCiphertext(Q, 256, corrupted), /Authentication failed/);
});

test('HW2 source regions contain executed functions and the UI passes public information to the attack', async () => {
  for (const [file, region, functionName] of [['hybrid', 'hybrid-encryption', 'encryptMessage'], ['caesar', 'caesar', 'caesarEncrypt'], ['cryptanalysis', 'chi-square', 'recoverCaesar'], ['ecc', 'restricted-search', 'recoverPrivateKey']]) {
    const source = await readFile(new URL(`../docs/homework-2/js/${file}.js`, import.meta.url), 'utf8');
    assert.ok(extractCodeRegion(source, region).includes(`function ${functionName}`));
    assert.doesNotMatch(source, /Math\.random|\beval\s*\(/);
  }
  const app = await readFile(new URL('../docs/homework-2/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /attackCiphertext\(ecc\.publicPoint, ecc\.keySpace, ecc\.payload\)/);
  assert.match(app, /encryptMessage\(message, publicInformation\.publicPoint\)/);
});

test('HW2 numbering, legacy paths, controls, four sections, and source blocks integrate correctly', async () => {
  const home = await readFile(new URL('../docs/index.html', import.meta.url), 'utf8');
  assert.deepEqual([...home.matchAll(/<h3>(Homework [^<]+)<\/h3>/g)].map(match => match[1]), ['Homework 1.1', 'Homework 1.2', 'Homework 2']);
  assert.deepEqual(scanHTML(home).filter(tag => tag.attributes.get('class') === 'homework-card').map(tag => tag.attributes.get('href')), ['./homework-01/', './homework-02/', './homework-2/']);
  for (const [path, label] of [['homework-01', 'Homework 1.1'], ['homework-02', 'Homework 1.2'], ['homework-2', 'Homework 2']]) {
    const html = await readFile(new URL(`../docs/${path}/index.html`, import.meta.url), 'utf8');
    assert.ok(html.includes(`<title>${label}`)); assert.ok(html.includes(`${label} · MSc`));
  }
  const html = await readFile(new URL('../docs/homework-2/index.html', import.meta.url), 'utf8');
  const tags = scanHTML(html), ids = new Set(tags.map(tag => tag.attributes.get('id')).filter(Boolean));
  assert.equal(tags.filter(tag => tag.name === 'section').length, 4);
  for (const id of ['encryption', 'comparison', 'cryptanalysis', 'restricted-attack', 'references']) assert.ok(ids.has(id));
  const app = await readFile(new URL('../docs/homework-2/js/app.js', import.meta.url), 'utf8');
  for (const [, id] of app.matchAll(/(?:find|show|status)\('([^']+)'/g)) assert.ok(ids.has(id), id);
  assert.equal(tags.filter(tag => tag.attributes.has('data-source')).length, 4);
  assert.match(html, /494<\/td><td>95\.0%/); assert.match(html, /not 520 independent/);
});

test('HW2 local corpus loading uses relative same-origin resources and reports fetch/format failures', async () => {
  const seen = [];
  const model = await loadCorpora(async (url, options) => {
    seen.push([url, options]); return { ok: true, text: () => readFile(url, 'utf8') };
  });
  assert.equal(model.reference.total, 107785); assert.equal(model.heldOutLetters, 119699);
  assert.ok(seen.every(([url, options]) => url.pathname.includes('/homework-2/data/') && options.redirect === 'error'));
  await assert.rejects(loadCorpora(async () => ({ ok: false, status: 404 })), /HTTP 404/);
  await assert.rejects(loadCorpora(async () => ({ ok: true, text: async () => 'no book' })), /markers/);
});

test('HW2 and both legacy URLs, corpus, worker, and snippets are served under the Pages subpath', async t => {
  const server = await createDevServer({ root: new URL('docs/', root).pathname, basePath: '/statistics-msc/' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/statistics-msc/`;
  for (const path of ['homework-01/', 'homework-02/', 'homework-2/', 'homework-2/js/experiment-worker.js', 'homework-2/data/README.md']) assert.equal((await fetch(base + path)).status, 200, path);
  for (const [name, expected] of [['alice', 107785], ['looking-glass', 119699]]) {
    const response = await fetch(`${base}homework-2/data/${name}.txt`);
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/plain/);
    assert.equal(lettersOnly(corpusBody(await response.text())).length, expected);
  }
});
