import { CHECKPOINTS, histogram } from './convergence.js';
import { byId, format, numberInput, showSVG, tableRows } from '../../shared/ui.js';
import { trajectoryChart, mseChart, distributionChart } from '../../shared/charts.js';

const form = byId('simulation-form');
const run = byId('run');
const cancel = byId('cancel');
const status = byId('status');
const model = byId('model');
const distribution = byId('distribution-n');
let worker;
let result;

function setStatus(message, state = 'ready') {
  status.textContent = message;
  status.dataset.state = state;
}

function clear() {
  worker?.terminate();
  worker = undefined;
  result = undefined;
  byId('simulation-results').hidden = true;
  run.disabled = typeof Worker === 'undefined';
  cancel.disabled = true;
  form.setAttribute('aria-busy', 'false');
}

function plotDistribution() {
  if (!result) return;
  const snapshot = result.snapshots.find(row => row.n === Number(distribution.value));
  byId('histogram-results').hidden = snapshot.z === null;
  byId('histogram-note').textContent = snapshot.z === null
    ? 'This Bernoulli model has σ = 0. The sample mean is constant and standardized fluctuations are undefined.'
    : `n = ${snapshot.n}, ${result.m} standardized means. Dashed curve: standard normal density.`;
  if (snapshot.z === null) return;
  const bins = histogram(snapshot.z, result.bound);
  showSVG('histogram', distributionChart(bins, snapshot.n, result.bound));
  tableRows('bins', bins.map(bin => [`${format(bin.left)} to ${format(bin.right)}`, bin.frequency, bin.density]));
}

function render(data, chosenModel) {
  result = data;
  tableRows('snapshots', data.snapshots.map(row => [
    row.n, row.mean, row.variance, row.mse, row.theory.variance,
    row.deviation, row.theory.chebyshev, row.zMean ?? '—', row.zVariance ?? '—'
  ]));
  showSVG('trajectories', trajectoryChart(data, chosenModel));
  showSVG('mse', mseChart(data));
  distribution.replaceChildren(...data.checkpoints.map(n => new Option(n, n)));
  distribution.value = data.checkpoints.at(-1);
  plotDistribution();
  byId('simulation-results').hidden = false;
}

function calculate() {
  clear();
  try {
    const config = {
      model: model.value,
      p: model.value === 'bernoulli' ? numberInput('p') : 0.35,
      m: numberInput('m'),
      maxN: Number(byId('max-n').value),
      seed: numberInput('seed'),
      epsilon: numberInput('epsilon')
    };
    const current = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker = current;
    run.disabled = true;
    cancel.disabled = false;
    form.setAttribute('aria-busy', 'true');
    setStatus('Simulating shared prefixes…');
    current.addEventListener('message', ({ data }) => {
      if (worker !== current) return;
      clear();
      if (data.error) {
        setStatus(data.error, 'error');
        return;
      }
      try {
        render(data.result, config.model);
        setStatus(`Simulated ${data.result.m} trajectories through n = ${config.maxN} with seed ${config.seed}.`);
      } catch (error) {
        clear();
        setStatus(error.message, 'error');
      }
    });
    current.addEventListener('error', event => {
      if (worker !== current) return;
      event.preventDefault();
      clear();
      setStatus('The simulation could not run in the background.', 'error');
    });
    current.postMessage(config);
  } catch (error) {
    clear();
    setStatus(error.message, 'error');
  }
}

byId('max-n').replaceChildren(...CHECKPOINTS.map(n => new Option(n, n)));
byId('max-n').value = CHECKPOINTS.at(-1);
form.addEventListener('submit', event => { event.preventDefault(); calculate(); });
form.addEventListener('input', () => {
  clear();
  byId('p').disabled = model.value === 'rademacher';
  form.querySelectorAll('[aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'));
  if (typeof Worker !== 'undefined') setStatus('Parameters changed. Run the simulation to refresh the results.');
});
cancel.addEventListener('click', () => { clear(); setStatus('Simulation cancelled.'); });
distribution.addEventListener('change', plotDistribution);
if (typeof Worker !== 'undefined') calculate();
else setStatus('This browser does not support background simulation.', 'error');
