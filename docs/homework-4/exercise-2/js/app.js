import { validateParameters } from './simulation.js';
import { histogram } from './statistics.js';
import { renderTrajectories, renderVariability, renderHistogram } from './charts.js';

const byId = id => document.getElementById(id);
const form = byId('simulation-form'), status = byId('simulation-status');
const runButton = byId('run-simulation'), cancelButton = byId('cancel-simulation');
const metric = byId('trajectory-metric'), distributionN = byId('distribution-n');
const format = value => value.toLocaleString('en-US', { maximumSignificantDigits: 6 });
let result = null, worker = null, runId = 0, resizeTimer;

function message(text, state = 'ready') {
  status.textContent = text; status.dataset.state = state;
}

function busy(value) {
  runButton.disabled = value; cancelButton.disabled = !value;
  form.setAttribute('aria-busy', String(value));
}

function clearResults() {
  result = null;
  ['trajectory-results', 'comparison-results'].forEach(id => { byId(id).hidden = true; });
  ['estimator-rows', 'variability-rows', 'trajectory-rows', 'histogram-rows', 'trajectory-chart',
    'mean-variability-chart', 'variance-variability-chart', 'means-histogram', 'variances-histogram'].forEach(id => byId(id).replaceChildren());
  metric.disabled = true; distributionN.disabled = true;
}

function stop() {
  runId += 1; worker?.terminate(); worker = null; busy(false);
}

function rows(id, values) {
  byId(id).replaceChildren(...values.map(values => {
    const row = document.createElement('tr');
    values.forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = typeof value === 'number' ? format(value) : value;
      row.append(cell);
    });
    return row;
  }));
}

function drawTrajectories() {
  if (!result) return;
  renderTrajectories(byId('trajectory-chart'), result, metric.value);
  const field = metric.value === 'mean' ? 'means' : 'variances';
  rows('trajectory-rows', result.snapshots.map(snapshot => [snapshot.n, ...result.paths.slice(0, 5).map(path => path[field][snapshot.n - 1])]));
}

function drawDistributions() {
  if (!result) return;
  const snapshot = result.snapshots.find(row => row.n === Number(distributionN.value));
  const means = histogram(snapshot.sampleMeans), variances = histogram(snapshot.sampleVariances);
  renderHistogram(byId('means-histogram'), means, 'mean', snapshot.n);
  renderHistogram(byId('variances-histogram'), variances, 'variance', snapshot.n);
  rows('histogram-rows', [['Mean', means], ['Variance', variances]].flatMap(([label, data]) =>
    data.bins.map(bin => [label, bin.left, bin.right, bin.count])));
}

function drawCharts() {
  if (!result) return;
  drawTrajectories(); drawDistributions();
  renderVariability(byId('mean-variability-chart'), result.snapshots, 'mean');
  renderVariability(byId('variance-variability-chart'), result.snapshots, 'variance');
}

function display() {
  const { m, maxN, seed } = result.config;
  ['trajectory-results', 'comparison-results'].forEach(id => { byId(id).hidden = false; });
  byId('parameter-summary').textContent = `m = ${format(m)}; maximum n = ${format(maxN)}; seed = ${seed}; ${format(result.scoresGenerated)} scores. Fixed discrete uniform distribution on 0–10.`;
  rows('estimator-rows', result.snapshots.map(row => [row.n, row.m, row.meanOfMeans, 5, Math.abs(row.meanOfMeans - 5), row.meanOfVariances, 10, Math.abs(row.meanOfVariances - 10)]));
  rows('variability-rows', result.snapshots.map(row => [row.n, row.varianceAcrossMeans, row.theory.varianceOfSampleMeans, row.varianceAcrossVariances, row.theory.varianceOfSampleVariances]));
  distributionN.replaceChildren(...result.snapshots.map(row => {
    const option = document.createElement('option'); option.value = row.n; option.textContent = `n = ${format(row.n)}`; return option;
  }));
  distributionN.value = String(maxN); distributionN.disabled = false; metric.disabled = false;
  const first = result.snapshots[0], last = result.snapshots.at(-1);
  byId('experimental-conclusion').textContent = `This run: at n = ${format(last.n)}, average sample mean = ${format(last.meanOfMeans)} (target 5) and average sample variance = ${format(last.meanOfVariances)} (target 10). Across n = ${first.n} to ${last.n}, variance across hacker means changes from ${format(first.varianceAcrossMeans)} to ${format(last.varianceAcrossMeans)}; variance across hacker variances changes from ${format(first.varianceAcrossVariances)} to ${format(last.varianceAcrossVariances)}. These are finite-run measurements, not guaranteed monotone trends.`;
  drawCharts();
}

function run() {
  stop(); clearResults();
  const seedInput = byId('seed');
  try {
    if (!/^\d+$/.test(seedInput.value.trim())) throw new RangeError('Seed must be a decimal integer from 1 to 2,147,483,646.');
    const config = validateParameters({ m: Number(byId('hackers').value), maxN: Number(byId('max-systems').value), seed: Number(seedInput.value.trim()) });
    seedInput.removeAttribute('aria-invalid');
    worker = new Worker(new URL('./simulation-worker.js', import.meta.url), { type: 'module' });
    const current = runId;
    busy(true); message('Calculating all hacker prefixes…', 'running');
    worker.addEventListener('message', ({ data }) => {
      if (current !== runId) return;
      worker.terminate(); worker = null; busy(false);
      if (data.error) { clearResults(); message(data.error, 'error'); return; }
      try { result = data.result; display(); message('Simulation complete. Tables and charts use the same Welford-derived samples.'); }
      catch (error) { clearResults(); message(`Could not display results: ${error.message}`, 'error'); }
    });
    worker.addEventListener('error', event => {
      if (current !== runId) return;
      event.preventDefault(); stop(); clearResults(); message('Worker failed. Reload the page and run the simulation again.', 'error');
    });
    worker.postMessage(config);
  } catch (error) {
    stop(); clearResults(); seedInput.setAttribute('aria-invalid', 'true'); message(error.message, 'error');
  }
}

form.addEventListener('submit', event => { event.preventDefault(); run(); });
cancelButton.addEventListener('click', () => { stop(); clearResults(); message('Simulation cancelled. Run again to generate results.'); });
form.addEventListener('input', () => { stop(); clearResults(); byId('seed').removeAttribute('aria-invalid'); message('Parameters changed. Run simulation to update results.'); });
metric.addEventListener('change', drawTrajectories);
distributionN.addEventListener('change', drawDistributions);
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawCharts, 100); });
window.addEventListener('pagehide', () => { worker?.terminate(); });

if (typeof Worker === 'undefined') message('Web Workers are unavailable in this browser. Formulas and source links remain available.', 'error');
else { busy(false); run(); }
