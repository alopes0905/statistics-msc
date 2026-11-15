import { PRESETS, parseCategoricalCSV } from './dataset.js';
import { analyzeIndependence, formatNumber, formatP, interpretation, testDecision } from './statistics.js';
import { conditionalChart } from './charts.js';

const $ = selector => document.querySelector(selector);
const percent = value => `${formatNumber(100 * value)}%`;

function node(tag, text, attributes = {}) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function table(target, caption, columns, rows) {
  const wrapper = node('div', undefined, { class: 'table-wrapper', tabindex: '0', 'aria-label': caption });
  const element = node('table', undefined, { class: 'numeric-table' });
  element.append(node('caption', caption));
  const head = node('thead'), tr = node('tr');
  columns.forEach(label => tr.append(node('th', label, { scope: 'col' })));
  head.append(tr);
  const body = node('tbody');
  rows.forEach(row => {
    const line = node('tr');
    row.forEach((value, i) => line.append(node(i ? 'td' : 'th', value, i ? {} : { scope: 'row' })));
    body.append(line);
  });
  element.append(head, body); wrapper.append(element); target.append(wrapper);
}

function details(target, title) {
  const element = node('details'); element.append(node('summary', title)); target.append(element);
  return element;
}

function renderChart(t, f) {
  $('#chart-figure').hidden = false;
  const width = Math.max(240, Math.min(600, $('#conditional-chart').clientWidth));
  const graphic = new DOMParser().parseFromString(conditionalChart(t, f, width), 'image/svg+xml');
  $('#conditional-chart').replaceChildren(document.importNode(graphic.documentElement, true));
  // Fit wide Unicode labels; full labels remain in titles and the numerical table.
  for (const label of $('#conditional-chart').querySelectorAll('.row-label')) {
    const text = label.lastChild, characters = [...text.textContent.replace(/…$/, '')];
    while (label.getComputedTextLength() > width - 20 && characters.length > 1) {
      characters.pop(); text.textContent = `${characters.join('')}…`;
    }
  }
}

function render(result, synthetic) {
  const { table: t, frequencies: f, expected, contributions, residuals, diagnostics: d } = result;
  const frequencyTarget = $('#frequency-results'); frequencyTarget.replaceChildren();
  table(frequencyTarget, `Observed counts · N = ${t.N}`, ['X / F', ...t.columns, 'Total'], [
    ...t.rows.map((name, i) => [name, ...t.observed[i].map(String), String(t.rowTotals[i])]),
    ['Total', ...t.columnTotals.map(String), String(t.N)]
  ]);
  table(details(frequencyTarget, 'Joint and marginal frequencies'), 'Joint frequencies · denominator N', ['X / F', ...t.columns, 'Marginal X'], [
    ...t.rows.map((name, i) => [name, ...f.joint[i].map(percent), percent(f.marginalX[i])]),
    ['Marginal F', ...f.marginalF.map(percent), '100%']
  ]);
  table(frequencyTarget, 'F given X · row percentages · denominator row total', ['X / F', ...t.columns], t.rows.map((name, i) => [name, ...f.FgivenX[i].map(percent)]));
  table(details(frequencyTarget, 'Reverse conditioning: X given F'), 'X given F · column percentages · denominator column total', ['X / F', ...t.columns], t.rows.map((name, i) => [name, ...f.XgivenF[i].map(percent)]));
  renderChart(t, f);
  $('#chart-legend').replaceChildren(...t.columns.map((name, j) => node('li', `${j + 1} · ${name}`)));
  const testTarget = $('#test-results'); testTarget.replaceChildren();
  const cellRows = t.rows.flatMap((name, i) => t.columns.map((label, j) => [name, label, String(t.observed[i][j]), formatNumber(expected[i][j]), formatNumber(contributions[i][j]), formatNumber(residuals[i][j])]));
  table(testTarget, 'Observed versus expected · contribution and signed Pearson residual per cell', ['X', 'F', 'Observed O', 'Expected E', '(O−E)²/E', '(O−E)/√E'], cellRows);
  testTarget.append(node('p', 'Expected row totals, column totals and grand total match the observed margins within floating-point tolerance.'));
  table(testTarget, 'Test summary · uncorrected Pearson statistic', ['χ²', 'df', 'Asymptotic p', 'Cramér’s V', 'α'], [[formatNumber(result.statistic), String(result.df), formatP(result.p), formatNumber(result.V), String(result.decision.alpha)]]);
  const message = node('p', `Expected-count check: minimum E = ${formatNumber(d.minimum)}; ${d.below5}/${d.cells} cells (${formatNumber(d.percentBelow5)}%) below 5; ${d.below1} below 1. ${d.allAtLeast5 ? 'Every expected count is at least 5; the count criterion supports the asymptotic approximation.' : `Caution: the asymptotic p-value may be unreliable. The broader no-E-below-1 / at-least-80%-at-5 guideline ${d.broaderGuidance ? 'is met, but this report uses the stricter all-at-least-5 policy' : 'is also not met'}.`}`, { class: d.allAtLeast5 ? 'diagnostic' : 'diagnostic warning' });
  testTarget.append(message);
  const conclusion = $('#interpretation'); conclusion.replaceChildren();
  const marginals = t.columns.map((name, j) => `${name}: ${percent(f.marginalF[j])}`).join('; ');
  const first = t.columns[0];
  conclusion.append(node('p', `Marginal distribution of F — ${marginals}. For F = “${first}”, the row-conditional frequencies are ${t.rows.map((name, i) => `${name}: ${percent(f.FgivenX[i][0])}`).join('; ')}.`));
  conclusion.append(node('p', interpretation(result), { class: result.decision.qualified ? 'warning' : 'decision' }));
  if (synthetic) conclusion.append(node('p', 'This synthetic teaching dataset illustrates the method; it establishes no real-world cybersecurity finding.'));
}

if (typeof document !== 'undefined') {
  const input = $('#csv-data'), preset = $('#dataset-preset'), alpha = $('#alpha'), status = $('#analysis-status');
  let current = null, currentSynthetic = true;
  function invalidate() {
    current = null;
    $('#frequency-results').replaceChildren(); $('#test-results').replaceChildren(); $('#interpretation').replaceChildren();
    $('#conditional-chart').replaceChildren(); $('#chart-legend').replaceChildren(); $('#chart-figure').hidden = true;
    status.dataset.state = 'pending'; status.textContent = 'Data changed. Run the analysis to update all frequencies and conclusions.';
  }
  function run() {
    invalidate();
    try {
      const result = analyzeIndependence(parseCategoricalCSV(input.value), Number(alpha.value));
      currentSynthetic = Object.values(PRESETS).includes(input.value);
      render(result, currentSynthetic); current = result;
      input.removeAttribute('aria-invalid'); status.dataset.state = 'success';
      status.textContent = `Analysis complete: ${result.table.N} observations, ${result.table.rows.length} × ${result.table.columns.length} categories. All displayed results use this dataset.`;
    } catch (error) {
      input.setAttribute('aria-invalid', 'true'); status.dataset.state = 'error'; status.textContent = error.message;
    }
  }
  preset.addEventListener('change', () => { if (PRESETS[preset.value]) input.value = PRESETS[preset.value]; invalidate(); });
  input.addEventListener('input', () => { preset.value = 'custom'; input.removeAttribute('aria-invalid'); invalidate(); });
  alpha.addEventListener('change', () => {
    if (!current) return;
    try {
      const updated = { ...current, decision: testDecision(current.p, Number(alpha.value), current.diagnostics) };
      render(updated, currentSynthetic); current = updated;
      status.textContent = `Significance level updated to ${alpha.value}; the dataset and numerical test results are unchanged.`;
    } catch (error) { invalidate(); status.dataset.state = 'error'; status.textContent = error.message; }
  });
  $('#analysis-form').addEventListener('submit', event => { event.preventDefault(); run(); });
  window.addEventListener('resize', () => { if (current) renderChart(current.table, current.frequencies); });
  $('#analyze').disabled = false;
  input.value = PRESETS.cybersecurity;
  run();
}
