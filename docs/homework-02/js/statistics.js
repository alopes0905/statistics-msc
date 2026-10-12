/**
 * BIP-39 layout for a numeric word count: 12, 15, 18, 21, or 24.
 * Checksum validity is a combinatorial fraction, not a security estimate.
 */
// #region mnemonic-layout
export function mnemonicLayout(wordCount) {
  if (
    !Number.isInteger(wordCount) || wordCount < 12 ||
    wordCount > 24 || wordCount % 3 !== 0
  ) {
    throw new RangeError('Word count must be a number: 12, 15, 18, 21, or 24.');
  }
  const entropyBits = wordCount * 32 / 3;
  const checksumBits = entropyBits / 32;
  const totalBits = entropyBits + checksumBits;
  const validityDenominator = 2 ** checksumBits;
  return {
    wordCount, entropyBits, checksumBits, totalBits,
    wordlistSize: 2 ** 11,
    validityDenominator,
    checksumValidFraction: 1 / validityDenominator,
  };
}
// #endregion mnemonic-layout

/**
 * Descriptive counts only; does not compute or validate an EIP-55 checksum.
 * Accepts exactly "0x" followed by 40 ASCII hexadecimal characters, no spaces.
 */
// #region address-case-counts
export function analyzeAddressCase(address) {
  if (typeof address !== 'string') throw new TypeError('Address must be a string.');
  if (address.length !== 42 || !/^0x[0-9a-fA-F]{40}$/u.test(address)) {
    throw new RangeError(
      'Address must have a lowercase 0x prefix and 40 hexadecimal characters.'
    );
  }
  const hexadecimal = address.slice(2);
  let digits = 0;
  let uppercaseLetters = 0;
  let lowercaseLetters = 0;
  for (const character of hexadecimal) {
    if (character >= '0' && character <= '9') digits += 1;
    else if (character >= 'A' && character <= 'F') uppercaseLetters += 1;
    else lowercaseLetters += 1;
  }
  return {
    address,
    lowercaseAddress: address.toLowerCase(),
    hexCharacters: hexadecimal.length,
    digits, uppercaseLetters, lowercaseLetters,
    alphabeticLetters: uppercaseLetters + lowercaseLetters,
  };
}
// #endregion address-case-counts
