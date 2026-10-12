import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mnemonicLayout, analyzeAddressCase } from '../docs/homework-02/js/statistics.js';
import { parseSourceRegions } from '../docs/assets/js/code-viewer.js';
import { scanHTML, resolveLocalReference } from '../tools/check.js';

// Independently supplied BIP-39 specification rows; no implementation-derived expectations.
const layouts = [
  [12, 128, 4, 132, 16],
  [15, 160, 5, 165, 32],
  [18, 192, 6, 198, 64],
  [21, 224, 7, 231, 128],
  [24, 256, 8, 264, 256],
];
for (const [wordCount, entropyBits, checksumBits, totalBits, validityDenominator] of layouts) {
  test(`BIP-39: ${wordCount} words match the independent specification row`, () => {
    assert.deepEqual(mnemonicLayout(wordCount), {
      wordCount, entropyBits, checksumBits, totalBits, wordlistSize: 2048,
      validityDenominator, checksumValidFraction: 1 / validityDenominator,
    });
  });
}

test('BIP-39 layout satisfies integer bit partitions and exact checksum fractions', () => {
  for (const words of [12, 15, 18, 21, 24]) {
    const result = mnemonicLayout(words);
    assert.ok([128, 160, 192, 224, 256].includes(result.entropyBits));
    assert.equal(result.entropyBits, result.checksumBits * 32);
    assert.equal(result.totalBits, result.entropyBits + result.checksumBits);
    assert.equal(result.totalBits, result.wordCount * 11);
    assert.equal(result.checksumValidFraction * result.validityDenominator, 1);
    assert.equal(result.checksumValidFraction, 2 ** -result.checksumBits);
    for (const key of ['wordCount', 'entropyBits', 'checksumBits', 'totalBits', 'wordlistSize', 'validityDenominator']) {
      assert.ok(Number.isInteger(result[key]));
    }
  }
});

test('BIP-39 rejects unsupported lengths, fractions, nonfinite values, and implicit coercion', () => {
  for (const input of [-24, -1, 0, 1, 11, 13, 14, 16, 17, 19, 20, 22, 23, 25, 128, 256, 12.5, 15.001, NaN, Infinity, -Infinity, '12', '24', '', null, undefined, true, false, 12n, new Number(12), Object.freeze([12]), Object.freeze({ valueOf: () => 12 })]) {
    assert.throws(() => mnemonicLayout(input), RangeError);
  }
});

test('calculations return independent results without changing inputs or shared state', () => {
  const first = mnemonicLayout(12);
  first.entropyBits = 0;
  assert.equal(mnemonicLayout(12).entropyBits, 128);
  const input = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
  const counted = analyzeAddressCase(input);
  counted.address = 'changed';
  assert.equal(input, '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  assert.equal(analyzeAddressCase(input).address, input);
});

// Official https://eips.ethereum.org/EIPS/eip-55#test-cases vectors.
// Counts were independently tallied in ten four-character blocks, not by this function.
const examples = [
  ['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed', 22, 9, 9],
  ['0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359', '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359', 23, 5, 12],
  ['0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB', '0xdbf03b407c01e7cd3cbea99509d93f8dddc8c6fb', 19, 13, 8],
  ['0x52908400098527886E0F7030069857D2E4169EE7', '0x52908400098527886e0f7030069857d2e4169ee7', 34, 6, 0],
  ['0xde709f2102306220921060314715629080e2fb77', '0xde709f2102306220921060314715629080e2fb77', 34, 0, 6],
];
for (const [address, lowercaseAddress, digits, uppercaseLetters, lowercaseLetters] of examples) {
  test(`EIP-55 published fixture ${address.slice(0, 6)}: independent descriptive counts`, () => {
    assert.equal(address.slice(2).length, 40);
    assert.deepEqual(analyzeAddressCase(address), {
      address, lowercaseAddress, hexCharacters: 40, digits, uppercaseLetters,
      lowercaseLetters, alphabeticLetters: uppercaseLetters + lowercaseLetters,
    });
  });
}

test('all decimal digits are counted only as digits', () => {
  for (const digit of '0123456789') {
    const result = analyzeAddressCase(`0x${digit.repeat(40)}`);
    assert.equal(result.digits, 40);
    assert.equal(result.uppercaseLetters, 0);
    assert.equal(result.lowercaseLetters, 0);
    assert.equal(result.alphabeticLetters, 0);
  }
});

test('letter counts and category totals hold for general hexadecimal input', () => {
  for (const character of 'abcdefABCDEF') {
    const result = analyzeAddressCase(`0x${character.repeat(40)}`);
    assert.equal(result.digits, 0);
    assert.equal(result.alphabeticLetters, 40);
    assert.equal(result.uppercaseLetters, character >= 'A' && character <= 'F' ? 40 : 0);
    assert.equal(result.lowercaseLetters + result.uppercaseLetters, 40);
    assert.equal(result.lowercaseAddress, `0x${character.toLowerCase().repeat(40)}`);
  }
  for (const [address] of examples) {
    const result = analyzeAddressCase(address);
    assert.equal(result.digits + result.uppercaseLetters + result.lowercaseLetters, 40);
    assert.equal(result.uppercaseLetters + result.lowercaseLetters, result.alphabeticLetters);
  }
});

test('case analysis is syntax validation and descriptive counting, not checksum validation', () => {
  const changed = '0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
  // Deliberately changed capitalization is accepted: no Keccak checksum is computed.
  assert.equal(analyzeAddressCase(changed).uppercaseLetters, 10);
  assert.equal(analyzeAddressCase(changed).lowercaseLetters, 8);
  assert.equal(analyzeAddressCase(changed).digits, 22);
  assert.equal(analyzeAddressCase(changed).lowercaseAddress, examples[0][1]);
});

test('address input contract rejects malformed lengths, prefixes, whitespace, and nonhex text', () => {
  const valid = examples[0][0];
  for (const input of ['', '0x', valid.slice(0, -1), `${valid}0`, valid.slice(2), valid.replace('0x', '0X'), valid.replace('0x', '0xx'), ` ${valid}`, `${valid} `, `${valid}\n`, `${valid}\r`, valid.replace('5', 'g'), valid.replace('5', '５'), valid.replace('5', '_')]) {
    assert.throws(() => analyzeAddressCase(input), RangeError);
  }
  for (const input of [null, undefined, 0, NaN, Infinity, true, {}, [], new String(valid)]) {
    assert.throws(() => analyzeAddressCase(input), TypeError);
  }
});

test('both source regions expose exactly the actual pure calculation functions', async () => {
  const source = await readFile(new URL('../docs/homework-02/js/statistics.js', import.meta.url), 'utf8');
  const regions = parseSourceRegions(source);
  assert.deepEqual([...regions.keys()], ['mnemonic-layout', 'address-case-counts']);
  assert.match(regions.get('mnemonic-layout'), /export function mnemonicLayout\(wordCount\)/);
  assert.match(regions.get('address-case-counts'), /export function analyzeAddressCase\(address\)/);
});

test('HW02 markup supplies every app target, labeled bounded selectors, fixtures, and relative navigation', async () => {
  const html = await readFile(new URL('../docs/homework-02/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../docs/homework-02/js/app.js', import.meta.url), 'utf8');
  const tags = scanHTML(html);
  const ids = new Set(tags.map(tag => tag.attributes.get('id')).filter(Boolean));
  for (const [, id] of app.matchAll(/find\('([^']+)'\)/g)) assert.ok(ids.has(id), id);
  const selects = tags.filter(tag => tag.name === 'select');
  assert.deepEqual(selects.map(tag => tag.attributes.get('id')), ['word-count', 'address-example']);
  assert.equal(tags.filter(tag => ['input', 'textarea'].includes(tag.name)).length, 0);
  for (const select of selects) {
    assert.ok(tags.some(tag => tag.name === 'label' && tag.attributes.get('for') === select.attributes.get('id')));
  }
  const optionValues = tags.filter(tag => tag.name === 'option').map(tag => tag.attributes.get('value'));
  assert.deepEqual(optionValues, ['12', '15', '18', '21', '24', ...examples.map(([address]) => address)]);
  assert.equal(tags.filter(tag => tag.name === 'section').length, 4);
  assert.equal(tags.filter(tag => tag.attributes.get('role') === 'status' && tag.attributes.get('aria-atomic') === 'true').length, 2);
  assert.deepEqual(resolveLocalReference('../#homework', 'homework-02/index.html'), { path: 'index.html', hash: 'homework' });
  assert.ok(tags.some(tag => tag.name === 'a' && tag.attributes.get('href') === '../homework-01/#foundations'));
  const home = await readFile(new URL('../docs/index.html', import.meta.url), 'utf8');
  const cards = scanHTML(home).filter(tag => tag.name === 'a' && tag.attributes.get('class') === 'homework-card');
  assert.deepEqual(cards.map(tag => tag.attributes.get('href')), ['./homework-01/', './homework-02/']);
});
