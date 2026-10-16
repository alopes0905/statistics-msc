export const MAX_TEXT_LENGTH = 20000;

export function validateText(text) {
  if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) throw new RangeError('Text must contain at most 20,000 UTF-16 code units.');
  return text;
}

export function validateShift(shift) {
  if (!Number.isInteger(shift) || shift < 0 || shift > 25) throw new RangeError('Caesar shift must be an integer from 0 to 25.');
  return shift;
}

// #region caesar
/** Rotate ASCII A–Z / a–z, preserving case. All other characters pass through.
 * Empty strings are valid. Keys outside 0..25 are rejected rather than coerced. */
export function caesarEncrypt(text, shift) {
  validateText(text);
  validateShift(shift);
  return text.replace(/[A-Za-z]/g, letter => {
    const base = letter <= 'Z' ? 65 : 97;
    return String.fromCharCode(base + (letter.charCodeAt(0) - base + shift) % 26);
  });
}

export function caesarDecrypt(text, shift) {
  validateShift(shift);
  return caesarEncrypt(text, (26 - shift) % 26);
}
// #endregion caesar
