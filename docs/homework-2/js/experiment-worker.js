import { LENGTHS, evaluateLength } from './cryptanalysis.js';

// Keep the exhaustive length experiment off the UI thread; no network or secrets.
self.addEventListener('message', ({ data }) => {
  try {
    for (const length of LENGTHS) {
      self.postMessage({ type: 'row', result: evaluateLength(data.heldOut, data.probabilities, length) });
    }
    self.postMessage({ type: 'complete' });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
});
