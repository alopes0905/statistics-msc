import { createWelford, updateWelford, getWelfordStatistics } from '../../shared/welford.js';

const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function parseObservations(text) {
  if (typeof text !== 'string' || text.length > 2000 || !text.trim()) throw new RangeError('Enter 1..32 finite numbers, separated by commas or spaces.');
  const tokens = text.trim().split(/[\s,]+/);
  if (tokens.length > 32 || tokens.some(token => !decimal.test(token) || !Number.isFinite(Number(token)))) {
    throw new RangeError('Enter 1..32 finite decimal numbers; scientific notation is allowed.');
  }
  return tokens.map(Number);
}

export function runningStatistics(values) {
  const state = createWelford();
  return values.map(value => {
    updateWelford(state, value);
    return { observation: value, ...getWelfordStatistics(state) };
  });
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('#welford-form'), input = document.querySelector('#observations');
  const status = document.querySelector('#example-status'), rows = document.querySelector('#example-rows');
  const format = value => value === null ? 'Undefined (n < 2)' : Number(value.toPrecision(10)).toString();
  function render() {
    try {
      const result = runningStatistics(parseObservations(input.value));
      const elements = result.map(row => {
        const tr = document.createElement('tr');
        [row.count, row.observation, row.mean, row.SS, row.sampleVariance].forEach(value => {
          const td = document.createElement('td'); td.textContent = format(value); tr.append(td);
        });
        return tr;
      });
      rows.replaceChildren(...elements);
      const last = result.at(-1);
      status.textContent = `n = ${last.count}; mean = ${format(last.mean)}; SS = ${format(last.SS)}; unbiased sample variance = ${format(last.sampleVariance)}. Display rounded; calculation unrounded.`;
      status.dataset.state = 'ready'; input.removeAttribute('aria-invalid');
    } catch (error) {
      rows.replaceChildren(); status.textContent = error.message;
      status.dataset.state = 'error'; input.setAttribute('aria-invalid', 'true');
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); render(); });
  input.addEventListener('input', () => { rows.replaceChildren(); status.dataset.state = 'ready'; input.removeAttribute('aria-invalid'); status.textContent = 'Observations changed. Calculate to update the table.'; });
  document.querySelector('#calculate').disabled = false;
  render();
}
