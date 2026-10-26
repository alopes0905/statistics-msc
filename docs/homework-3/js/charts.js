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

/** Plot existing snapshot variances; no statistics or trajectories are recomputed. */
export function renderVarianceScaling(container, snapshots) {
  const metrics = ['total', 'average', 'normalized'];
  const labels = ['Total Sₙ', 'Average Sₙ/n', 'Normalized Sₙ/√n'];
  let series;
  try {
    if (!Array.isArray(snapshots) || snapshots.length === 0) throw new Error('No variance checkpoints are available.');
    snapshots.forEach((snapshot, i) => {
      if (!Number.isSafeInteger(snapshot.n) || snapshot.n <= 0 || (i > 0 && snapshot.n <= snapshots[i - 1].n)) throw new Error('System counts must be positive, increasing integers.');
    });
    series = metrics.map((metric, i) => ({ metric, label: labels[i], points: snapshots.map(snapshot => {
      const theoretical = snapshot.metrics?.[metric]?.theoretical?.variance;
      const empirical = snapshot.metrics?.[metric]?.empirical?.variance;
      if (![theoretical, empirical].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Variances must be finite and nonnegative.');
      return { n: snapshot.n, theoretical, empirical };
    }) }));
  } catch (error) {
    const message = document.createElement('p');
    message.textContent = `Variance chart unavailable: ${error.message}`;
    message.className = 'legend'; message.setAttribute('data-state', 'error');
    container.replaceChildren(message); container.setAttribute('data-state', 'error'); return;
  }
  const positive = series.flatMap(s => s.points.flatMap(point => [point.theoretical, point.empirical])).filter(value => value > 0);
  if (positive.length === 0) {
    const message = document.createElement('p');
    message.textContent = 'Deterministic process: all theoretical and sample variances are zero. Zero has no logarithm, so no logarithmic plot is drawn. The exact zeros remain in the tables below.';
    message.className = 'legend';
    container.replaceChildren(message); container.setAttribute('data-state', 'zero'); return;
  }
  const width = Math.max(250, Math.round(container.getBoundingClientRect().width || 720));
  const height = 310, left = 66, right = width - 16, top = 28, bottom = height - 48;
  let xLow = Math.log10(snapshots[0].n), xHigh = Math.log10(snapshots.at(-1).n);
  if (xLow === xHigh) { xLow -= 0.5; xHigh += 0.5; }
  let yLow = Math.floor(Math.log10(Math.min(...positive))), yHigh = Math.ceil(Math.log10(Math.max(...positive)));
  if (yLow === yHigh) { yLow -= 1; yHigh += 1; }
  // Work in exponent space, including near the floating-point limits.
  const x = n => left + (Math.log10(n) - xLow) / (xHigh - xLow) * (right - left);
  const y = variance => bottom - (Math.log10(variance) - yLow) / (yHigh - yLow) * (bottom - top);
  const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': `${container.id}-title ${container.id}-desc` });
  svg.append(node('title', { id: `${container.id}-title` }, 'Variance scaling as system count increases'),
    node('desc', { id: `${container.id}-desc` }, 'Both axes use logarithmic coordinates with ticks in original units. Lines show existing theoretical variances; circle, square, and triangle markers show existing sample variances. Total variance grows as n, average variance falls as 1/n, and normalized variance stays constant. The numerical tables below provide all values.'));
  const tickLimit = width < 420 ? 5 : 9;
  const stride = Math.max(1, Math.ceil((yHigh - yLow) / (tickLimit - 1)));
  const powers = [...new Set([...Array.from({ length: Math.floor((yHigh - yLow) / stride) + 1 }, (_, i) => yLow + i * stride), yHigh])];
  powers.forEach(power => {
    const value = 10 ** power;
    if (!Number.isFinite(value) || value <= 0) return;
    const label = power >= -4 && power <= 5 ? value.toLocaleString('en', { maximumFractionDigits: 4 }) : `1e${power}`;
    svg.append(node('line', { x1: left, x2: right, y1: y(value), y2: y(value), class: 'grid-line' }),
      node('text', { x: left - 8, y: y(value) + 4, 'text-anchor': 'end', 'data-axis': 'variance', 'data-value': value }, label));
  });
  const indices = width < 420 ? [...new Set([0, Math.floor((snapshots.length - 1) / 2), snapshots.length - 1])] : snapshots.map((_, i) => i);
  indices.forEach((index, i) => {
    const n = snapshots[index].n;
    svg.append(node('text', { x: x(n), y: bottom + 20, 'text-anchor': i === 0 ? 'start' : i === indices.length - 1 ? 'end' : 'middle', 'data-axis': 'systems', 'data-value': n }, n.toLocaleString('en')));
  });
  svg.append(node('text', { x: left, y: 15 }, 'Variance (log scale)'),
    node('text', { x: (left + right) / 2, y: height - 5, 'text-anchor': 'middle' }, 'Systems n (log scale)'));
  let omitted = 0;
  series.forEach(({ metric, label, points }, index) => {
    const group = node('g', { class: `variance-series variance-${metric}`, 'data-metric': metric });
    // Zero checkpoints break a line; no zero is passed to the log transform.
    let segment = [];
    const flush = () => { if (segment.length) line({ svg: group, x, y }, segment, 'variance-line'); segment = []; };
    points.forEach(point => { if (point.theoretical > 0) segment.push([point.n, point.theoretical]); else { omitted += 1; flush(); } });
    flush();
    points.forEach(point => {
      if (point.empirical === 0) { omitted += 1; return; }
      const cx = x(point.n), cy = y(point.empirical);
      const attributes = { class: 'variance-marker', 'data-n': point.n, 'data-variance': point.empirical };
      const marker = index === 0 ? node('circle', { ...attributes, cx, cy, r: 3.5 })
        : index === 1 ? node('rect', { ...attributes, x: cx - 3.5, y: cy - 3.5, width: 7, height: 7 })
          : node('polygon', { ...attributes, points: `${cx},${cy - 4.5} ${cx - 4},${cy + 3.5} ${cx + 4},${cy + 3.5}` });
      marker.append(node('title', {}, `${label}, n = ${point.n}: sample variance ${point.empirical}`));
      group.append(marker);
    });
    svg.append(group);
  });
  container.replaceChildren(svg); container.setAttribute('data-state', 'ready');
  if (omitted > 0) {
    const message = document.createElement('p');
    message.className = 'legend';
    message.textContent = `${omitted} zero-valued variance points are not plotted because log(0) is undefined; their exact values remain in the tables. Positive theoretical curves remain visible.`;
    container.append(message);
  }
}
