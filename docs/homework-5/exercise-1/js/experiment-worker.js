import { integrationExperiment } from './experiments.js';
self.addEventListener('message',({data})=>{
  try { self.postMessage({result:integrationExperiment(data)}); }
  catch(error) { self.postMessage({error:error.message}); }
});
