import {
  INFINITY, enumeratePoints, pointOrder, scalarMultiples, analyzeSubgroup,
} from './statistics.js';

const CURVE = Object.freeze({ a: 0, b: 7, p: 17 });
const DEFAULT_BASE = Object.freeze({ x: 1, y: 5 });

/** Parse the private-key UI domain without coercing or rounding malformed input. */
export function parsePrivateScalar(raw, order) {
  if (!Number.isSafeInteger(order) || order < 2) throw new RangeError('An affine base order is required.');
  const message = `Private scalar must be a whole number from 1 to ${order - 1}.`;
  if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw.trim())) throw new RangeError(message);
  const scalar = Number(raw.trim());
  if (!Number.isSafeInteger(scalar) || scalar < 1 || scalar >= order) throw new RangeError(message);
  return scalar;
}

function pointText(point) {
  return point === INFINITY ? 'O' : `(${point.x}, ${point.y})`;
}

function textNode(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function tableRows(body, rows) {
  body.replaceChildren(...rows.map((values) => {
    const row = document.createElement('tr');
    values.forEach((value, index) => {
      const cell = textNode(index === 0 ? 'th' : 'td', String(value));
      if (index === 0) cell.scope = 'row';
      row.append(cell);
    });
    return row;
  }));
}

function svgNode(tag, attributes, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function initializeHomework() {
  const find = (id) => document.getElementById(id);
  const form = find('key-form');
  const baseSelect = find('base-point');
  const scalarInput = find('private-scalar');
  const status = find('demo-status');
  const points = enumeratePoints(CURVE);
  let base = DEFAULT_BASE;
  let analysis;
  let cycle;
  let step = 0;

  function announce(message, error = false) {
    status.textContent = message;
    status.dataset.state = error ? 'error' : 'ready';
    scalarInput.setAttribute('aria-invalid', String(error));
  }

  function clearResult() {
    find('key-result').hidden = true;
    find('multiples-body').replaceChildren();
  }

  const grid = find('plot-grid');
  const marks = find('plot-points');
  const plotX = (x) => 52 + 20 * x;
  const plotY = (y) => 352 - 20 * y;
  for (let coordinate = 0; coordinate < CURVE.p; coordinate += 1) {
    grid.append(
      svgNode('line', { x1: plotX(coordinate), x2: plotX(coordinate), y1: 32, y2: 352 }),
      svgNode('line', { x1: 52, x2: 372, y1: plotY(coordinate), y2: plotY(coordinate) }),
      svgNode('text', { x: plotX(coordinate), y: 375, 'text-anchor': 'middle' }, coordinate),
      svgNode('text', { x: 39, y: plotY(coordinate) + 4, 'text-anchor': 'end' }, coordinate),
    );
  }
  grid.append(svgNode('text', { x: 399, y: 356 }, 'x'), svgNode('text', { x: 48, y: 17 }, 'y'));
  points.forEach((point) => {
    const circle = svgNode('circle', { cx: plotX(point.x), cy: plotY(point.y), r: 4 });
    circle.append(svgNode('title', {}, pointText(point)));
    marks.append(circle);
  });
  tableRows(find('all-points-body'), points.map((point) => [point.x, point.y]));
  points.forEach((point, index) => {
    const option = textNode('option', `${pointText(point)} · order ${pointOrder(point, CURVE)}`);
    option.value = String(index);
    option.selected = point.x === DEFAULT_BASE.x && point.y === DEFAULT_BASE.y;
    baseSelect.append(option);
  });

  function renderStep() {
    const current = cycle[step];
    const previous = cycle[step - 1];
    const equation = step === 0 ? '0G = O' :
      `${step}G = ${step - 1}G + G = ${pointText(previous)} + ${pointText(base)} = ${pointText(current)}`;
    find('step-equation').textContent = equation;
    find('step-note').textContent = current === INFINITY
      ? 'O is the identity, with no affine coordinates to plot. The next addition returns G.'
      : `Current multiple: ${pointText(current)}. This grid shows residues, not a smooth real curve.`;
    find('step-position').textContent = `Step ${step} of ${analysis.order + 1} · full cycle including O`;
    find('previous-step').disabled = step === 0;
    find('next-step').disabled = step === analysis.order + 1;
    const highlight = find('plot-highlights');
    const x = plotX(base.x);
    const y = plotY(base.y);
    highlight.replaceChildren(svgNode('polygon', {
      points: `${x},${y - 7} ${x + 7},${y} ${x},${y + 7} ${x - 7},${y}`,
      class: 'plot-base',
    }));
    if (current !== INFINITY) {
      highlight.append(svgNode('circle', {
        cx: plotX(current.x), cy: plotY(current.y), r: 10, class: 'plot-current',
      }));
    }
    find('curve-description').textContent =
      `All ${points.length} affine points of y squared equals x cubed plus 7 modulo 17. ` +
      `Base G is ${pointText(base)}; ${step}G is ${pointText(current)}. Coordinates appear in the tables below.`;
  }

  function renderStatistics() {
    const { order, sampleSize, width } = analysis;
    find('experiment-summary').textContent =
      `G = ${pointText(base)} has order n = ${order}. This experiment enumerates all ${sampleSize} ` +
      `valid scalars, k = 1 through ${order - 1}, once each; it excludes O and is independent of the input above.`;
    find('coordinate-summary').textContent =
      `${analysis.distinctX} distinct x-values and ${analysis.distinctY} distinct y-values among ` +
      `${sampleSize} distinct points. Each frequency column totals ${sampleSize}.`;
    tableRows(find('frequency-body'), analysis.xFrequencies.map((count, coordinate) =>
      [coordinate, count, analysis.yFrequencies[coordinate]]));
    find('frequency-total-x').textContent = String(sampleSize);
    find('frequency-total-y').textContent = String(sampleSize);
    tableRows(find('bits-body'), analysis.xBits.map((count, index) => [
      `Bit ${width - 1 - index} (${2 ** (width - 1 - index)})`, count.zeros, count.ones,
      analysis.yBits[index].zeros, analysis.yBits[index].ones,
    ]));
    tableRows(find('observations-body'), analysis.observations.map(({ k, point, encoding }) =>
      [k, pointText(point), `${encoding.slice(0, width)} ${encoding.slice(width)}`]));
    const correlationText = (value) => value === null
      ? 'Undefined: fewer than two observations or zero coordinate variance.'
      : `${value.toFixed(3)} (rounded for display)`;
    find('correlation-x').textContent = correlationText(analysis.correlationX);
    find('correlation-y').textContent = correlationText(analysis.correlationY);
    tableRows(find('hamming-body'), analysis.adjacentChanges.map(({ from, to, distance }) =>
      [`${from} → ${to}`, `${distance} / ${2 * width}`]));
    find('hamming-empty').hidden = analysis.adjacentChanges.length > 0;
    find('hamming-table').hidden = analysis.adjacentChanges.length === 0;
    find('subgroup-observation').textContent = order === 2
      ? 'This order-2 subgroup has only one nonidentity point. No adjacent pair or correlation is available.'
      : order === points.length + 1
        ? 'This base generates the full 18-element group. Its 17 nonidentity points include (3, 0), which is its own inverse.'
        : `This base generates a proper subgroup: ${order} of the ${points.length + 1} group elements, including O. ` +
          'The coordinate tables therefore describe this subgroup, rather than the entire curve.';
  }

  function calculate(message) {
    let scalar;
    try {
      scalar = parsePrivateScalar(scalarInput.value, analysis.order);
    } catch (error) {
      clearResult();
      announce(error.message, true);
      scalarInput.focus();
      return;
    }
    const multiples = scalarMultiples(base, scalar, CURVE);
    find('result-base').textContent = pointText(base);
    find('result-scalar').textContent = String(scalar);
    find('public-key').textContent = `Q = ${scalar}G = ${pointText(multiples.at(-1))}`;
    tableRows(find('multiples-body'), multiples.map((point, index) => [`${index + 1}G`, pointText(point)]));
    find('key-result').hidden = false;
    step = scalar;
    renderStep();
    announce(message ?? `Calculated ${scalar}G = ${pointText(multiples.at(-1))}.`);
  }

  function changeBase(initial = false) {
    base = points[Number(baseSelect.value)];
    analysis = analyzeSubgroup(base, CURVE);
    cycle = [INFINITY, ...scalarMultiples(base, analysis.order + 1, CURVE)];
    find('base-summary').textContent = `Selected G = ${pointText(base)} · order n = ${analysis.order}`;
    find('scalar-help').textContent = `Private-key domain: whole numbers from 1 to ${analysis.order - 1}. ` +
      'Zero and multiples of n produce O mathematically and are excluded here.';
    let reset = false;
    try { parsePrivateScalar(scalarInput.value, analysis.order); }
    catch { scalarInput.value = '1'; reset = true; }
    renderStatistics();
    calculate(initial ? undefined : reset
      ? `Base changed to ${pointText(base)}. The previous input was outside its domain; k was reset to 1.`
      : `Base changed to ${pointText(base)}. The public key and full experiment were recalculated.`);
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); calculate(); });
  baseSelect.addEventListener('change', () => changeBase());
  scalarInput.addEventListener('input', () => {
    clearResult();
    announce('Input changed. Calculate to derive the new toy public key.');
  });
  find('previous-step').addEventListener('click', () => { if (step > 0) { step -= 1; renderStep(); } });
  find('next-step').addEventListener('click', () => {
    if (step < analysis.order + 1) { step += 1; renderStep(); }
  });
  find('reset-step').addEventListener('click', () => { step = 0; renderStep(); });
  find('default-example').addEventListener('click', () => {
    baseSelect.value = String(points.findIndex((point) => point.x === 1 && point.y === 5));
    scalarInput.value = '6';
    changeBase(true);
  });
  changeBase(true);
  find('key-controls').disabled = false;
  find('step-controls').hidden = false;
  find('live-experiment').hidden = false;
  find('loading-note').hidden = true;
}

if (typeof document !== 'undefined') {
  try { initializeHomework(); }
  catch {
    const note = document.getElementById('loading-note');
    note.textContent = 'The interactive experiment could not initialize. The worked example and source links remain available.';
    note.dataset.state = 'error';
  }
}
