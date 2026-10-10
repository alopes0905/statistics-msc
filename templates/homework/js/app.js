const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const maximumExampleValues = 1000;

/**
 * Validate the template's example form only; this is not statistical logic.
 * Commas and whitespace separate decimal numbers (including scientific notation).
 * The size limit keeps this UI example small; it is not an assignment assumption.
 * @returns {{values: number[], parameter: number}} Finite example inputs.
 */
export function validateExampleInputs(dataset, parameter) {
  if (typeof dataset !== 'string' || !dataset.trim()) throw new Error('Enter at least one example value.');
  if (dataset.length > 100000) throw new Error('The example input is too long.');
  // Reject missing comma-separated values instead of silently discarding them.
  if (/(?:^|,)\s*(?:,|$)/.test(dataset.trim())) {
    throw new Error('A comma-separated value is missing.');
  }
  const tokens = dataset.trim().split(/[\s,]+/);
  if (tokens.length > maximumExampleValues) throw new Error('Use at most 1,000 values in this template example.');
  const values = tokens.map((token, index) => {
    const value = Number(token);
    if (!numberPattern.test(token) || !Number.isFinite(value)) {
      throw new Error(`Value ${index + 1} must be a finite decimal number.`);
    }
    return value;
  });
  if (typeof parameter !== 'string' || !numberPattern.test(parameter.trim()) || !Number.isFinite(Number(parameter))) {
    throw new Error('Enter a finite decimal number for the example parameter.');
  }
  return { values, parameter: Number(parameter) };
}

export function initializeExampleForm(root) {
  const form = root.querySelector('[data-example-form]');
  if (!form) return;
  const dataset = form.elements.namedItem('dataset');
  const parameter = form.elements.namedItem('parameter');
  const status = root.querySelector('[data-demo-status]');
  const result = root.querySelector('[data-demo-result]');
  const count = root.querySelector('[data-value-count]');
  const parameterResult = root.querySelector('[data-parameter-result]');
  form.querySelector('button[type="submit"]').disabled = false;
  status.textContent = 'Ready to validate example inputs. No statistical calculation will run.';

  function clearResult() {
    result.hidden = true;
    count.textContent = '';
    parameterResult.textContent = '';
    status.dataset.state = 'ready';
    status.textContent = 'Inputs changed. Validate again to inspect their structure.';
  }
  form.addEventListener('input', clearResult);
  form.addEventListener('reset', clearResult);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    result.hidden = true;
    try {
      const inputs = validateExampleInputs(dataset.value, parameter.value);
      count.textContent = String(inputs.values.length);
      parameterResult.textContent = String(inputs.parameter);
      result.hidden = false;
      status.dataset.state = 'ready';
      status.textContent = 'Example inputs are valid. This checks input structure only; no statistical result has been computed.';
    } catch (error) {
      status.dataset.state = 'error';
      status.textContent = error.message;
    }
  });
}

if (typeof document !== 'undefined') initializeExampleForm(document);
