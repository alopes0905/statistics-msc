import { caesarEncrypt, caesarDecrypt, validateText, validateShift } from './caesar.js';

export const LENGTHS = Object.freeze([20, 50, 100, 300, 1000, 3000]);
export const SAMPLES_PER_LENGTH = 20;

/** ASCII letters only: filtering precedes case folding, so e.g. ß never becomes SS. */
export function lettersOnly(text) {
  if (typeof text !== 'string') throw new TypeError('Expected text.');
  return text.replace(/[^A-Za-z]/g, '').toUpperCase();
}

export function countLetters(text) {
  if (typeof text !== 'string') throw new TypeError('Expected text.');
  const counts = Array(26).fill(0);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 65 && code <= 90) counts[code - 65] += 1;
    else if (code >= 97 && code <= 122) counts[code - 97] += 1;
  }
  return counts;
}

export function letterFrequencies(text) {
  const counts = countLetters(text);
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) throw new RangeError('The reference text needs ASCII letters.');
  return { counts, total, probabilities: counts.map(count => count / total) };
}

function validateProbabilities(probabilities, length) {
  if (!Array.isArray(probabilities) || probabilities.length !== length
      || probabilities.some(p => !Number.isFinite(p) || p <= 0 || p > 1)
      || Math.abs(probabilities.reduce((sum, p) => sum + p, 0) - 1) > 1e-12) {
    throw new RangeError('Reference probabilities must be positive, normalized, and match the alphabet.');
  }
}

// #region chi-square
/** Pearson score, not a p-value or a confidence percentage. */
export function chiSquare(observed, probabilities) {
  if (!Array.isArray(observed) || observed.length === 0 || observed.some(n => !Number.isSafeInteger(n) || n < 0)) {
    throw new TypeError('Observed counts must be nonnegative safe integers.');
  }
  validateProbabilities(probabilities, observed.length);
  const total = observed.reduce((sum, count) => sum + count, 0);
  if (!Number.isSafeInteger(total) || total === 0) throw new RangeError('At least one observed letter is required.');
  return observed.reduce((score, count, i) => {
    const expected = total * probabilities[i];
    return score + (count - expected) ** 2 / expected;
  }, 0);
}

/** Ciphertext and training frequencies only; no true shift or known plaintext.
 * Rank all 26 decryptions; numerical ties use ascending key order and are flagged.
 * A relative 1e-12 tolerance covers rounding in the 26-term score sum. */
export function recoverCaesar(ciphertext, probabilities) {
  validateText(ciphertext);
  validateProbabilities(probabilities, 26);
  const total = countLetters(ciphertext).reduce((sum, count) => sum + count, 0);
  if (total === 0) return { total, best: null, candidates: [], tied: false };
  const candidates = Array.from({ length: 26 }, (_, key) => {
    const plaintext = caesarDecrypt(ciphertext, key);
    return { key, plaintext, score: chiSquare(countLetters(plaintext), probabilities) };
  }).sort((a, b) => a.score - b.score || a.key - b.key);
  const tied = candidates[1].score - candidates[0].score <= 1e-12 * Math.max(1, candidates[0].score);
  // Group against a fixed minimum, avoiding a non-transitive tolerant comparator.
  for (let start = 0; start < candidates.length;) {
    const limit = candidates[start].score + 1e-12 * Math.max(1, candidates[start].score);
    let end = start + 1;
    while (end < candidates.length && candidates[end].score <= limit) end += 1;
    candidates.splice(start, end - start, ...candidates.slice(start, end).sort((a, b) => a.key - b.key));
    start = end;
  }
  return { total, best: candidates[0], candidates, tied };
}
// #endregion chi-square

/** Strip only the publisher wrapper; complete local files retain their notices.
 * Fail explicitly if the known markers disappear rather than training on licenses. */
export function corpusBody(raw) {
  if (typeof raw !== 'string') throw new TypeError('Expected a Gutenberg text.');
  const start = /^\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK .*\*\*\*\s*$/m.exec(raw);
  const end = /^\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK .*\*\*\*\s*$/m.exec(raw);
  if (!start || !end || end.index <= start.index + start[0].length) throw new Error('Corpus start/end markers are missing or out of order.');
  return raw.slice(start.index + start[0].length, end.index).trim();
}

/** Spread windows evenly through a held-out, letters-only book. For each length
 * windows do not overlap; different lengths reuse positions and are dependent. */
export function sampleWindows(text, length, samples = SAMPLES_PER_LENGTH) {
  const letters = lettersOnly(text);
  if (!Number.isInteger(length) || length < 1 || length > 3000 || !Number.isInteger(samples)
      || samples < 2 || samples > 100 || length * samples > letters.length) {
    throw new RangeError('Need 2..100 distinct, nonoverlapping windows, each 1..3,000 letters long.');
  }
  return Array.from({ length: samples }, (_, index) => {
    const start = Math.floor(index * (letters.length - length) / (samples - 1));
    return { start, plaintext: letters.slice(start, start + length) };
  });
}

/** Evaluate known keys outside the recovery algorithm. All shifts expose the
 * same frequency problem up to rotation; trials are not independent samples. */
export function evaluateLength(heldOutText, probabilities, length, samples = SAMPLES_PER_LENGTH, keys = Array.from({ length: 26 }, (_, i) => i)) {
  validateProbabilities(probabilities, 26);
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 26 || new Set(keys).size !== keys.length) throw new RangeError('Choose distinct Caesar keys.');
  keys.forEach(validateShift);
  const windows = sampleWindows(heldOutText, length, samples);
  let correct = 0, ambiguous = 0, firstFailure = null;
  for (const window of windows) {
    for (const trueKey of keys) {
      const ciphertext = caesarEncrypt(window.plaintext, trueKey);
      const result = recoverCaesar(ciphertext, probabilities);
      if (result.tied) ambiguous += 1;
      if (!result.tied && result.best.key === trueKey) correct += 1;
      else if (!firstFailure) firstFailure = { start: window.start, plaintext: window.plaintext, ciphertext,
        trueKey, predictedKey: result.best.key, recovered: result.best.plaintext, tied: result.tied };
    }
  }
  const trials = windows.length * keys.length;
  return { length, samples: windows.length, trials, correct, ambiguous, accuracy: 100 * correct / trials, firstFailure };
}

export async function loadCorpora(fetchText = globalThis.fetch) {
  const urls = ['../data/alice.txt', '../data/looking-glass.txt'].map(path => new URL(path, import.meta.url));
  const raw = await Promise.all(urls.map(async url => {
    const response = await fetchText(url, { credentials: 'same-origin', redirect: 'error' });
    if (!response.ok) throw new Error(`The local English corpus could not load (HTTP ${response.status}).`);
    return response.text();
  }));
  const [training, heldOut] = raw.map(corpusBody);
  return { training, heldOut, reference: letterFrequencies(training), heldOutLetters: lettersOnly(heldOut).length };
}
