import { simulate } from './simulation.js';

self.addEventListener('message', ({ data }) => {
  try { self.postMessage({ result: simulate(data) }); }
  catch (error) { self.postMessage({ error: error.message }); }
});
