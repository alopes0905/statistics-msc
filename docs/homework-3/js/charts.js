import { normalPDF, scoreValues } from './statistics.js';

const namespace = 'http://www.w3.org/2000/svg';
const numeric = value => Object.is(value, -0) ? '0' : Number(value.toPrecision(3)).toString();

function node(tag, attributes = {}, text = '') {
  const element = document.createElementNS(namespace, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  if (text) element.textContent = text;
  return element;
}

function extent(values) {
  const low = Math.min(...values), high = Math.max(...values);
  const pad = low === high ? Math.max(1, Math.abs(low) * 0.1) : (high - low) * 0.08;
  return [low - pad, high + pad];
}

function frame(container, title, description, xDomain, yDomain, xLabel, yLabel, height = 280) {
  const width = Math.max(250, Math.round(container.getBoundingClientRect().width || 720));
  const left = width < 400 ? 48 : 62, right = width - 14, top = 25, bottom = height - 46;
  const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': `${container.id}-title ${container.id}-desc` });
  svg.append(node('title', { id: `${container.id}-title` }, title), node('desc', { id: `${container.id}-desc` }, description));
  const x = value => left + (value - xDomain[0]) / (xDomain[1] - xDomain[0]) * (right - left);
  const y = value => bottom - (value - yDomain[0]) / (yDomain[1] - yDomain[0]) * (bottom - top);
  for (let i = 0; i <= 3; i += 1) {
    const value = yDomain[0] + i / 3 * (yDomain[1] - yDomain[0]);
    svg.append(node('line', { x1: left, x2: right, y1: y(value), y2: y(value), class: 'grid-line' }), node('text', { x: left - 7, y: y(value) + 4, 'text-anchor': 'end' }, numeric(value)));
  }
  const ticks = width < 420 ? 2 : 4;
  for (let i = 0; i <= ticks; i += 1) {
    const value = xDomain[0] + i / ticks * (xDomain[1] - xDomain[0]);
    svg.append(node('text', { x: x(value), y: bottom + 20, 'text-anchor': i === ticks ? 'end' : i === 0 ? 'start' : 'middle' }, numeric(value)));
  }
  svg.append(node('text', { x: left, y: 14 }, yLabel), node('text', { x: (left + right) / 2, y: height - 5, 'text-anchor': 'middle' }, xLabel));
  container.replaceChildren(svg);
  return { svg, x, y, bottom };
}

function line(chart, points, className) {
  chart.svg.append(node('polyline', { points: points.map(([x, y]) => `${chart.x(x)},${chart.y(y)}`).join(' '), class: className }));
}

export function renderTrajectories(container, result, metric) {
  const { maxN, model, p } = result.config;
  const mu = model === 'rademacher' ? 0 : p;
  const step = Math.max(1, Math.ceil(maxN / 250));
  const indices = [...new Set([1, ...Array.from({ length: Math.floor(maxN / step) }, (_, i) => (i + 1) * step), ...result.snapshots.map(row => row.n), maxN])].sort((a, b) => a - b);
  const paths = result.paths.map(path => indices.map(k => [k, scoreValues(path[k], k)[metric]]));
  const reference = indices.map(k => [k, scoreValues(k * mu, k)[metric]]);
  const yDomain = extent([...paths.flatMap(path => path.map(point => point[1])), ...reference.map(point => point[1])]);
  const names = { total: 'Total Sₖ', average: 'Average Sₖ/k', normalized: 'Normalized Sₖ/√k' };
  const chart = frame(container, `${names[metric]}: sample attacker trajectories`, `First ${result.paths.length} attackers. Solid paths are sampled trajectories; the dashed path is the theoretical expectation. Numerical values at the experiment grid are in the trajectory table.`, [maxN === 1 ? 0 : 1, maxN], yDomain, 'System / step k', names[metric], 330);
  paths.forEach((path, i) => line(chart, path, `sample-path path-${i % 4}`));
  line(chart, reference, 'reference-path');
}

export function renderHistogram(container, histogram, title, xLabel, normal = false, commonDomain = null) {
  const xDomain = commonDomain ?? (normal ? [Math.min(-4, histogram.left), Math.max(4, histogram.right)] : [histogram.left, histogram.right]);
  const maxDensity = Math.max(...histogram.bins.map(bin => bin.density), normal ? normalPDF(0) : 0);
  const chart = frame(container, title, `Density histogram of ${histogram.sampleSize} attacker outcomes. Bin area sums to one.${normal ? ' The dashed curve is the standard normal density.' : ''} Counts, bin edges and densities are available in the numerical histogram table.`, xDomain, [0, maxDensity * 1.12], xLabel, 'Density', 245);
  histogram.bins.forEach(bin => chart.svg.append(node('rect', {
    x: chart.x(bin.left), y: chart.y(bin.density), width: Math.max(0, chart.x(bin.right) - chart.x(bin.left)),
    height: chart.bottom - chart.y(bin.density), class: 'histogram-bar', 'data-count': bin.count, 'data-density': bin.density,
  })));
  if (normal) {
    const points = Array.from({ length: 161 }, (_, i) => {
      const x = xDomain[0] + i / 160 * (xDomain[1] - xDomain[0]); return [x, normalPDF(x)];
    });
    line(chart, points, 'normal-curve');
  }
}

export function renderLLN(container, snapshots) {
  const chart = frame(container, 'LLN: deviation probability versus system count', 'Solid points show the fraction of attacker averages outside epsilon of the model mean. The dashed line joins capped Chebyshev bounds at the sampled system counts. Exact numerical values follow in the table.', [0, snapshots.at(-1).n], [0, 1], 'Systems n', 'Probability', 290);
  line(chart, snapshots.map(row => [row.n, row.lln.bound]), 'reference-path');
  line(chart, snapshots.map(row => [row.n, row.lln.probability]), 'empirical-line');
  snapshots.forEach(row => chart.svg.append(node('circle', { cx: chart.x(row.n), cy: chart.y(row.lln.probability), r: 3.5, class: 'empirical-point' })));
}
