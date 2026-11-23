import { analyzeAlert, updateBeta, sequentialBeta } from './bayes.js';
import { byId, format, numberInput, showSVG, tableRows } from '../../shared/ui.js';
import { betaMeanChart } from '../../shared/charts.js';

function evidence(update) {
  return update.underflow ? 'Below floating-point range' : update.evidence;
}

function posterior(update) {
  return update.posterior?.[0] ?? 'Undefined (impossible evidence)';
}

function renderAlert() {
  const result = analyzeAlert(numberInput('prior'), numberInput('sensitivity'), numberInput('false-positive'));
  tableRows('alert-metrics', [
    ['Prior P(A)', result.prior], ['Sensitivity P(+ | A)', result.sensitivity],
    ['False-positive rate P(+ | Aᶜ)', result.falsePositive],
    ['Evidence P(+)', evidence(result.positive)], ['Posterior P(A | +)', posterior(result.positive)],
    ['Evidence P(−)', evidence(result.negative)], ['Posterior P(A | −)', posterior(result.negative)],
    ['Positive likelihood ratio', result.likelihoodRatio], ['Prior odds', result.priorOdds],
    ['Positive posterior odds', result.posteriorOdds]
  ]);
  const [[tp, fn], [fp, tn]] = result.confusion;
  tableRows('confusion', [
    ['Intrusion', tp, fn, tp + fn], ['No intrusion', fp, tn, fp + tn], ['Total', tp + fp, fn + tn, 10000]
  ]);
  tableRows('alert-sensitivity', [0.002, 0.02, 0.20].map(prior => {
    const comparison = analyzeAlert(prior, result.sensitivity, result.falsePositive);
    return [prior, evidence(comparison.positive), posterior(comparison.positive)];
  }));
}

const betaLabel = ({ alpha, beta }) => `Beta(${format(alpha)}, ${format(beta)})`;

function renderBeta() {
  const alpha = numberInput('alpha');
  const beta = numberInput('beta');
  const n = numberInput('trials');
  const successes = numberInput('successes');
  const result = updateBeta(alpha, beta, n, successes);
  tableRows('beta-metrics', [
    ['Shape', betaLabel(result.prior), betaLabel(result.posterior)],
    ['Mean', result.prior.mean, result.posterior.mean],
    ['Variance', result.prior.variance, result.posterior.variance],
    ['Concentration', result.prior.concentration, result.posterior.concentration]
  ]);
  byId('beta-predictive').textContent = result.sampleProportion === null
    ? `With no data, the posterior equals the prior. Predictive success probability: ${format(result.predictive)}.`
    : `Observed success proportion: ${format(result.sampleProportion)}. Predictive success probability for the next trial: ${format(result.predictive)}.`;
  const outcomes = Array.from({ length: n }, (_, i) => Number(i < successes));
  const step = sequentialBeta(alpha, beta, outcomes);
  byId('beta-sequential').textContent = `Processing ${successes} successes and ${n - successes} failures one at a time gives ${betaLabel(step)}. The batch update gives ${betaLabel(result.posterior)}.`;
  showSVG('beta-chart', betaMeanChart(result.prior.mean, result.sampleProportion, result.posterior.mean));
  tableRows('beta-sensitivity', [[1, 1], [2, 8], [20, 80]].map(([a, b]) => {
    const item = updateBeta(a, b, n, successes);
    return [betaLabel(item.prior), item.prior.mean, item.prior.concentration, betaLabel(item.posterior), item.posterior.mean];
  }));
}

function connect(id, render) {
  const form = byId(`${id}-form`);
  const results = byId(`${id}-results`);
  const status = byId(`${id}-status`);
  function update() {
    form.querySelectorAll('[aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'));
    try {
      render();
      results.hidden = false;
      status.textContent = 'Results updated.';
      status.dataset.state = 'ready';
    } catch (error) {
      results.hidden = true;
      status.textContent = error.message;
      status.dataset.state = 'error';
    }
  }
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', update);
  update();
}

connect('alert', renderAlert);
connect('beta', renderBeta);
