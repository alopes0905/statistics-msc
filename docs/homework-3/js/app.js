import { DEFAULTS, validateParameters } from './simulation.js';
import { METRICS, theoreticalMoments, incrementMoments, scoreValues, scoreHistogram, cltComparison } from './statistics.js';
import { renderTrajectories, renderHistogram, renderLLN, renderVarianceScaling } from './charts.js';

const find = id => document.getElementById(id);
const show = (id, text) => { find(id).textContent = text; };
const format = x => x === 0 ? '0' : Math.abs(x) < 0.0001 ? x.toExponential(3) : Number(x.toPrecision(6)).toLocaleString('en', { maximumFractionDigits: 8 });
const names = { total: 'Sₙ', average: 'Sₙ/n', normalized: 'Sₙ/√n' };
let result = null, worker = null, selectedN = DEFAULTS.maxN, busy = false;

function status(message, error = false) {
  show('simulation-status', message); find('simulation-status').dataset.state = error ? 'error' : 'ready';
}

function row(values) {
  const tr = document.createElement('tr');
  values.forEach((value, i) => {
    const cell = document.createElement(i === 0 ? 'th' : 'td');
    if (i === 0) cell.scope = 'row';
    cell.textContent = String(value); tr.append(cell);
  });
  return tr;
}

function numberInput(id, integer = false) {
  const raw = find(id).value;
  if (!(integer ? /^[0-9]+$/ : /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/).test(raw)) throw new RangeError(`${find(id).labels[0].textContent} needs a valid ${integer ? 'integer' : 'decimal number'}.`);
  return Number(raw);
}

function configFromInputs() {
  const model = find('model').value;
  // The inactive Bernoulli field is not a parameter of the Rademacher model.
  const p = model === 'bernoulli' ? numberInput('probability') : DEFAULTS.p;
  return validateParameters({ model, p, m: numberInput('attackers', true),
    maxN: numberInput('max-systems', true), epsilon: numberInput('epsilon'), seed: numberInput('seed', true) });
}

function renderTheory(config) {
  const { mu, sigma2 } = incrementMoments(config.model, config.p);
  show('model-summary', config.model === 'rademacher'
    ? 'Rademacher: equally likely +1 and −1; μ = 0, σ² = 1. A negative value is a signed score, not a negative count of compromised systems.'
    : `Bernoulli: +1 with probability p = ${config.p}, otherwise 0; μ = ${config.p}, σ² = ${format(sigma2)}. Scores count modeled successful events.`);
  const theory = theoreticalMoments(config.model, config.p, selectedN);
  show('parameter-summary', `${config.model === 'rademacher' ? 'Rademacher' : `Bernoulli(p = ${config.p})`} · m = ${config.m.toLocaleString('en')} · maximum n = ${config.maxN.toLocaleString('en')} · ε = ${config.epsilon} · seed ${config.seed}. Displayed distributions: n = ${selectedN.toLocaleString('en')}.`);
  find('selected-moments').replaceChildren(...METRICS.map(metric => row([names[metric], format(result.snapshots.find(s => s.n === selectedN).metrics[metric].empirical.mean), format(theory[metric].mean), format(result.snapshots.find(s => s.n === selectedN).metrics[metric].empirical.variance), format(theory[metric].variance)])));
  show('lln-target', `The target is μ = ${format(mu)}. Each empirical probability uses all ${config.m} attacker averages and the strict threshold |Sₙ/n − μ| > ${config.epsilon}.`);
}

function renderDistributions() {
  const snapshot = result.snapshots.find(s => s.n === selectedN);
  const { model } = result.config;
  const binRows = [];
  for (const metric of METRICS) {
    const histogram = scoreHistogram(snapshot.metrics.total.values, selectedN, model, metric);
    renderHistogram(find(`${metric}-histogram`), histogram, `${names[metric]} at n = ${selectedN}`, names[metric]);
    histogram.bins.forEach(bin => binRows.push(row([names[metric], format(bin.left), format(bin.right), bin.count, format(bin.density)])));
  }
  find('histogram-rows').replaceChildren(...binRows);
  const aggregate = snapshot.aggregate;
  show('aggregate-summary', `Separate aggregate T(n,m): observed ${format(aggregate.observed)}, theoretical E[T] = ${format(aggregate.mean)}, Var(T) = ${format(aggregate.variance)}. This sums all ${result.config.m} attackers at n = ${selectedN}; it is not a single attacker’s score.`);
}

function renderCLT() {
  const isRademacher = result.config.model === 'rademacher';
  find('clt-results').hidden = !isRademacher; find('bernoulli-clt-note').hidden = isRademacher;
  if (!isRademacher) {
    for (const id of ['clt-small', 'clt-medium', 'clt-large']) find(id).replaceChildren();
    find('clt-rows').replaceChildren(); return;
  }
  const snapshots = result.snapshots;
  const large = snapshots.find(s => s.n === 1000) ?? snapshots.at(-1);
  const middle = snapshots.find(s => s.n === 100 && s.n < large.n) ?? snapshots[Math.floor((snapshots.length - 1) / 2)];
  const chosen = [snapshots[0], middle, large];
  const limit = Math.max(4, ...chosen.flatMap(s => s.metrics.normalized.values.map(x => Math.ceil(Math.abs(x) * 2) / 2)));
  const ids = ['small', 'medium', 'large'];
  find('clt-rows').replaceChildren(...chosen.map((snapshot, i) => {
    const comparison = cltComparison(snapshot, result.config.model);
    show(`clt-${ids[i]}-caption`, `n = ${snapshot.n} · normalized score Sₙ/√n`);
    renderHistogram(find(`clt-${ids[i]}`), scoreHistogram(snapshot.metrics.total.values, snapshot.n, 'rademacher', 'normalized'), `Rademacher CLT at n = ${snapshot.n}`, 'Sₙ/√n', true, [-limit, limit]);
    return row([snapshot.n, format(comparison.mean), format(comparison.variance), comparison.distance.toFixed(4)]);
  }));
}

function renderCharts() {
  if (!result) return;
  renderTrajectories(find('trajectory-chart'), result, find('trajectory-metric').value);
  renderDistributions(); renderLLN(find('lln-chart'), result.snapshots); renderCLT();
  renderVarianceScaling(find('variance-chart'), result.snapshots);
}

function renderAll() {
  const options = result.snapshots.map(snapshot => {
    const option = document.createElement('option'); option.value = String(snapshot.n); option.textContent = `n = ${snapshot.n.toLocaleString('en')}`; return option;
  });
  find('distribution-n').replaceChildren(...options); find('distribution-n').value = String(selectedN);
  renderTheory(result.config);
  for (const metric of METRICS) find(`${metric}-scaling-rows`).replaceChildren(...result.snapshots.map(snapshot => {
    const { empirical, theoretical } = snapshot.metrics[metric];
    return row([snapshot.n, format(empirical.mean), format(theoretical.mean), format(empirical.variance), format(theoretical.variance)]);
  }));
  find('lln-rows').replaceChildren(...result.snapshots.map(snapshot => row([snapshot.n, snapshot.lln.outside, snapshot.lln.probability.toFixed(4), format(snapshot.lln.bound)])));
  find('trajectory-rows').replaceChildren(...result.snapshots.map(snapshot => row([snapshot.n, ...result.paths.slice(0, 5).map(path => format(scoreValues(path[snapshot.n], snapshot.n)[find('trajectory-metric').value]))])));
  renderCharts();
}

function clearResults() {
  find('variance-chart').replaceChildren();
  result = null; find('simulation-results').hidden = true;
  find('distribution-results').hidden = true; find('convergence-results').hidden = true;
  find('distribution-n').disabled = true; find('trajectory-metric').disabled = true;
}

function stopWorker() {
  worker?.terminate(); worker = null; busy = false; find('cancel-simulation').disabled = true;
}

function run() {
  stopWorker(); clearResults();
  let config;
  try { config = configFromInputs(); }
  catch (error) { status(error.message, true); return; }
  if (typeof Worker !== 'function') { status('Web Workers are unavailable. Use a modern browser over HTTP(S); no simulation results have been substituted.', true); return; }
  const started = performance.now();
  busy = true; find('cancel-simulation').disabled = false;
  status(`Computing ${(config.m * config.maxN).toLocaleString('en')} increments in a worker… Controls remain available; Run replaces the current job.`);
  try {
    const job = new Worker(new URL('./simulation-worker.js', import.meta.url), { type: 'module' });
    worker = job;
    job.addEventListener('message', ({ data }) => {
      if (worker !== job) return;
      stopWorker();
      if (data.error) { status(data.error, true); return; }
      result = data.result; selectedN = config.maxN;
      for (const id of ['simulation-results', 'distribution-results', 'convergence-results']) find(id).hidden = false;
      find('distribution-n').disabled = false; find('trajectory-metric').disabled = false;
      renderAll();
      status(`Completed ${result.increments.toLocaleString('en')} increments across ${config.m.toLocaleString('en')} attackers in ${(performance.now() - started).toFixed(0)} ms on this device. All results use the displayed seed and trajectory prefixes.`);
    });
    job.addEventListener('error', () => { if (worker !== job) return; stopWorker(); clearResults(); status('The simulation worker failed to load or execute. Serve the page over HTTP(S) and reload.', true); });
    job.postMessage(config);
  } catch (error) { stopWorker(); status(error.message, true); }
}

find('simulation-form').addEventListener('submit', event => { event.preventDefault(); run(); });
find('cancel-simulation').addEventListener('click', () => { stopWorker(); clearResults(); status('Simulation cancelled. Run again to generate results.'); });
for (const id of ['model', 'probability', 'attackers', 'max-systems', 'epsilon', 'seed']) find(id).addEventListener('input', () => {
  if (busy) stopWorker();
  clearResults(); find('probability').disabled = find('model').value === 'rademacher';
  status('Parameters changed. Run the simulation to update every result.');
});
find('distribution-n').addEventListener('change', () => { selectedN = Number(find('distribution-n').value); renderTheory(result.config); renderDistributions(); });
find('trajectory-metric').addEventListener('change', () => {
  renderTrajectories(find('trajectory-chart'), result, find('trajectory-metric').value);
  find('trajectory-rows').replaceChildren(...result.snapshots.map(snapshot => row([snapshot.n, ...result.paths.slice(0, 5).map(path => format(scoreValues(path[snapshot.n], snapshot.n)[find('trajectory-metric').value]))])));
});
let resizeFrame = 0;
const resize = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(renderCharts); };
window.addEventListener('resize', resize);
find('probability').disabled = find('model').value === 'rademacher';
find('run-simulation').disabled = false;
run();
