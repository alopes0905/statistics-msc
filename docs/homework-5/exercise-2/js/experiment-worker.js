import { cdfExperiment } from './experiments.js';
self.addEventListener('message',({data})=>{
  try { self.postMessage({result:cdfExperiment(data.x)}); }
  catch(error) { self.postMessage({error:error.message}); }
});
