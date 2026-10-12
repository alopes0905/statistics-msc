import { mnemonicLayout, analyzeAddressCase } from './statistics.js';

const find = (id) => document.getElementById(id);
const words = find('word-count');
const example = find('address-example');

function updateMnemonic() {
  const result = mnemonicLayout(Number(words.value));
  find('entropy-bits').textContent = `${result.entropyBits} bits`;
  find('checksum-bits').textContent = `${result.checksumBits} bits`;
  find('encoded-bits').textContent = `${result.totalBits} bits`;
  find('mnemonic-words').textContent = `${result.wordCount} words`;
  find('wordlist-size').textContent = `${result.wordlistSize} words`;
  find('valid-fraction').textContent = `1/${result.validityDenominator}`;
  find('mnemonic-status').textContent = `${result.wordCount} words encode ${result.entropyBits} entropy bits and ${result.checksumBits} checksum bits. Exactly 1/${result.validityDenominator} of all word-index sequences have a valid checksum.`;
}

function updateAddress() {
  const result = analyzeAddressCase(example.value);
  find('checksummed-address').textContent = result.address;
  find('lowercase-address').textContent = result.lowercaseAddress;
  find('hex-count').textContent = result.hexCharacters;
  find('digit-count').textContent = result.digits;
  find('alphabetic-count').textContent = result.alphabeticLetters;
  find('uppercase-count').textContent = result.uppercaseLetters;
  find('lowercase-count').textContent = result.lowercaseLetters;
  find('address-status').textContent = `Published example: ${result.digits} digits, ${result.uppercaseLetters} uppercase letters, and ${result.lowercaseLetters} lowercase letters; ${result.hexCharacters} hexadecimal characters in total. Case counts do not verify the checksum.`;
}

updateMnemonic();
updateAddress();
words.addEventListener('change', updateMnemonic);
example.addEventListener('change', updateAddress);
words.disabled = false;
example.disabled = false;
