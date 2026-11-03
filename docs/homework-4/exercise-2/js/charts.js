const namespace = 'http://www.w3.org/2000/svg';
const number = value => Number(value.toPrecision(3)).toString();

function node(tag, attributes = {}, text = '') {
  const element = document.createElementNS(namespace, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  if (text) element.textContent = text;
  return element;
}

function frame(container, title, description, xDomain, yDomain, xLabel, yLabel, logarithmic = false) {
  const width = Math.max(220, Math.round(container.getBoundingClientRect().width || 650));
  const height = 285, left = 55, right = width - 18, top = 30, bottom = height - 48;
  const transform = logarithmic ? Math.log10 : value => value;
  const scale = (domain, low, high) => value => low + (transform(value) - transform(domain[0])) /
    (transform(domain[1]) - transform(domain[0])) * (high - low);
  const x = scale(xDomain, left, right), y = scale(yDomain, bottom, top);
  const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': `${container.id}-title ${container.id}-desc` });
  svg.append(node('title', { id: `${container.id}-title` }, title), node('desc', { id: `${container.id}-desc` }, description));
  function ticks(domain, count) {
    if (!logarithmic) return Array.from({ length: count + 1 }, (_, i) => domain[0] + i / count * (domain[1] - domain[0]));
    const values = [domain[0]];
    for (let power = Math.ceil(Math.log10(domain[0])); power <= Math.floor(Math.log10(domain[1])); power += 1) values.push(10 ** power);
    values.push(domain[1]);
    return [...new Set(values)];
  }
  ticks(yDomain, 3).forEach(value => svg.append(
    node('line', { x1: left, x2: right, y1: y(value), y2: y(value), class: 'grid-line' }),
    node('text', { x: left - 6, y: y(value) + 4, 'text-anchor': 'end' }, number(value))));
  ticks(xDomain, width < 400 ? 2 : 4).forEach((value, i, all) => svg.append(
    node('text', { x: x(value), y: bottom + 20, 'text-anchor': i === 0 ? 'start' : i === all.length - 1 ? 'end' : 'middle' }, number(value))));
  svg.append(node('text', { x: left, y: 15 }, yLabel), node('text', { x: (left + right) / 2, y: height - 4, 'text-anchor': 'middle' }, xLabel));
  container.replaceChildren(svg);
  return { svg, x, y, bottom };
}

function line(chart, points, className) {
  chart.svg.append(node('polyline', { points: points.map(([x, y]) => `${chart.x(x)},${chart.y(y)}`).join(' '), class: className }));
}

/** Read retained running estimates, without generating or recalculating scores. */
export function renderTrajectories(container, result, metric) {
  const variance = metric === 'variance';
  const first = variance ? 2 : 1, last = result.config.maxN, reference = variance ? 10 : 5;
  const indices = [...new Set([first, ...Array.from({ length: last }, (_, i) => i + 1)
    .filter(n => n >= first && n % Math.max(1, Math.ceil(last / 220)) === 0),
    ...result.snapshots.map(row => row.n), last])].sort((a, b) => a - b);
  const paths = result.paths.map(path => indices.map(n => [n, path[variance ? 'variances' : 'means'][n - 1]]));
  const maximum = Math.max(reference, ...paths.flatMap(path => path.map(point => point[1])));
  const label = variance ? 'Running sample variance' : 'Running sample mean';
  const xStart = first === last ? first - 1 : first;
  const chart = frame(container, label, `First ${paths.length} hackers. Dashed reference at ${reference}. Numerical checkpoint values follow. All m hackers contribute to the statistical tables.`,
    [xStart, last], [0, maximum * 1.08], 'Systems k', label);
  paths.forEach((path, i) => line(chart, path, `sample-path path-${i % 4}`));
  if (first === last) paths.forEach((path, i) => chart.svg.append(node('circle', { cx: chart.x(last), cy: chart.y(path[0][1]), r: 3, class: `single-path-point path-${i % 4}` })));
  line(chart, [[xStart, reference], [last, reference]], 'reference-path');
}

export function renderVariability(container, snapshots, metric) {
  const means = metric === 'mean';
  const field = means ? 'varianceAcrossMeans' : 'varianceAcrossVariances';
  const theoryField = means ? 'varianceOfSampleMeans' : 'varianceOfSampleVariances';
  const positive = snapshots.flatMap(row => [row[field], row.theory[theoryField]]).filter(value => value > 0);
  let low = 10 ** Math.floor(Math.log10(Math.min(...positive))), high = 10 ** Math.ceil(Math.log10(Math.max(...positive)));
  if (low === high) { low /= 10; high *= 10; }
  const first = snapshots[0].n, last = snapshots.at(-1).n;
  const chart = frame(container, `Variability of sample ${means ? 'means' : 'variances'}`,
    'Both axes are logarithmic. Dashed line: exact theoretical variance. Circles: unbiased across-hacker sample variance (denominator m−1). Exact values follow in the variability table.',
    [first === last ? first / 2 : first, last], [low, high], 'Systems n (log)', 'Estimator variance (log)', true);
  line(chart, snapshots.map(row => [row.n, row.theory[theoryField]]), 'reference-path');
  snapshots.filter(row => row[field] > 0).forEach(row => {
    const marker = node('circle', { cx: chart.x(row.n), cy: chart.y(row[field]), r: 4, class: 'empirical-point', 'data-n': row.n, 'data-value': row[field] });
    marker.append(node('title', {}, `n = ${row.n}: ${row[field]}`)); chart.svg.append(marker);
  });
  const omitted = snapshots.filter(row => row[field] === 0).length;
  if (omitted) {
    const message = document.createElement('p'); message.className = 'field-help';
    message.textContent = `${omitted} zero empirical value(s) cannot be shown on a log axis; they remain in the table.`;
    container.append(message);
  }
}

export function renderHistogram(container, histogram, metric, n) {
  const reference = metric === 'mean' ? 5 : 10;
  const label = metric === 'mean' ? 'Sample mean' : 'Sample variance';
  const minimum = Math.min(histogram.left, reference), maximum = Math.max(histogram.right, reference);
  const pad = (maximum - minimum) * 0.04;
  const chart = frame(container, `${label}s across hackers at n = ${n}`,
    `Count histogram of ${histogram.sampleSize} Welford-derived estimates. Dashed vertical reference at ${reference}. Numerical bins follow. No normality assumption is made.`,
    [minimum - pad, maximum + pad], [0, Math.max(...histogram.bins.map(bin => bin.count)) * 1.15], label, 'Hackers (count)');
  histogram.bins.forEach(bin => chart.svg.append(node('rect', {
    x: chart.x(bin.left), y: chart.y(bin.count), width: Math.max(0, chart.x(bin.right) - chart.x(bin.left)),
    height: chart.bottom - chart.y(bin.count), class: 'histogram-bar', 'data-count': bin.count,
  })));
  chart.svg.append(node('line', { x1: chart.x(reference), x2: chart.x(reference), y1: 30, y2: chart.bottom, class: 'reference-path' }));
}
