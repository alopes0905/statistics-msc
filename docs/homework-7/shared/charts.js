// Chart labels and styles come from the report and computed numbers.
const WIDTH = 400;
const HEIGHT = 225;
const LEFT = 61;
const RIGHT = 375;
const TOP = 24;
const BOTTOM = 178;

const tick = value => Number(value.toPrecision(3)).toString();

function svg(title, content, height = HEIGHT) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${title}"><title>${title}</title>${content}</svg>`;
}

function axes(title, xRange, yRange, xTicks, yTicks, labels, logX = false) {
  const transform = logX ? Math.log : value => value;
  const x = value => LEFT + (RIGHT - LEFT) * (transform(value) - transform(xRange[0])) / (transform(xRange[1]) - transform(xRange[0]));
  const y = value => BOTTOM - (BOTTOM - TOP) * (value - yRange[0]) / (yRange[1] - yRange[0]);
  const line = (points, style) => `<polyline class="${style}" points="${points.map(([a, b]) => `${x(a)},${y(b)}`).join(' ')}"/>`;
  const grid = yTicks.map(value => `<path class="grid-line" d="M${LEFT} ${y(value)}H${RIGHT}"/><text x="${LEFT - 5}" y="${y(value) + 4}" text-anchor="end">${tick(value)}</text>`).join('');
  const ticks = xTicks.map(value => `<text x="${x(value)}" y="196" text-anchor="middle">${tick(value)}</text>`).join('');
  return {
    x, y, line,
    draw: marks => svg(title, `${grid}${ticks}${marks}<text x="${LEFT}" y="15">${labels[1]}</text><text x="${(LEFT + RIGHT) / 2}" y="217" text-anchor="middle">${labels[0]}</text>`)
  };
}

function sizeTicks(checkpoints) {
  if (checkpoints.length <= 4) return checkpoints;
  return checkpoints.filter((_, i) => (i % 2 === 0 && i !== checkpoints.length - 2) || i === checkpoints.length - 1);
}

export function trajectoryChart(result, model) {
  const [low, high] = model === 'bernoulli' ? [0, 1] : [-1, 1];
  const { checkpoints, moments, paths } = result;
  const xmax = Math.max(20, checkpoints.at(-1));
  const plot = axes('First simulated sample-mean trajectories and the theoretical mean', [10, xmax], [low, high], sizeTicks(checkpoints), [low, (low + high) / 2, high], ['Sample size n (log scale)', 'Sample mean'], true);
  const lines = paths.map(path => {
    const points = checkpoints.map((n, i) => [n, path[i]]);
    return points.length === 1
      ? `<circle class="empirical-point" cx="${plot.x(points[0][0])}" cy="${plot.y(points[0][1])}" r="3"/>`
      : plot.line(points, 'sample-path');
  });
  return plot.draw(lines.join('') + plot.line([[10, moments.mean], [xmax, moments.mean]], 'reference-path'));
}

export function mseChart({ snapshots, checkpoints }) {
  const ymax = Math.max(1e-12, ...snapshots.flatMap(row => [row.mse, row.theory.mse]));
  const xmax = Math.max(20, checkpoints.at(-1));
  const plot = axes('Empirical mean squared error and theoretical one-over-n decay', [10, xmax], [0, ymax], sizeTicks(checkpoints), [0, ymax / 2, ymax], ['Sample size n (log scale)', 'Mean squared error'], true);
  const theory = checkpoints.length === 1
    ? `<circle class="reference-path" cx="${plot.x(10)}" cy="${plot.y(snapshots[0].theory.mse)}" r="6"/>`
    : plot.line(snapshots.map(row => [row.n, row.theory.mse]), 'reference-path');
  const empirical = plot.line(snapshots.map(row => [row.n, row.mse]), 'empirical-line');
  const points = snapshots.map(row => `<circle class="empirical-point" cx="${plot.x(row.n)}" cy="${plot.y(row.mse)}" r="3"/>`).join('');
  return plot.draw(theory + empirical + points);
}

export function distributionChart(bins, n, bound) {
  const normal = z => Math.exp(-0.5 * z ** 2) / Math.sqrt(2 * Math.PI);
  const ymax = Math.max(normal(0), ...bins.map(bin => bin.density));
  const plot = axes(`Density histogram of standardized means at n = ${n} with standard normal reference`, [-bound, bound], [0, ymax], [-bound, -bound / 2, 0, bound / 2, bound], [0, ymax / 2, ymax], ['Standardized mean Zₙ', 'Density']);
  const bars = bins.map(bin => `<rect class="histogram-bar" x="${plot.x(bin.left)}" y="${plot.y(bin.density)}" width="${plot.x(bin.right) - plot.x(bin.left)}" height="${plot.y(0) - plot.y(bin.density)}"/>`).join('');
  const curve = Array.from({ length: 121 }, (_, i) => {
    const z = bound * (i / 60 - 1);
    return [z, normal(z)];
  });
  return plot.draw(bars + plot.line(curve, 'reference-path'));
}

export function betaMeanChart(prior, observed, posterior) {
  const x = value => 12 + value * 376;
  const entries = [['Prior mean', prior], ['Observed proportion', observed], ['Posterior mean', posterior]];
  const marks = entries.map(([label, value], i) => {
    const y = 34 + i * 44;
    return `<text x="12" y="${y - 9}">${label} · ${value === null ? 'Undefined' : tick(value)}</text><path class="grid-line" d="M12 ${y}H388"/>${value === null ? '' : `<circle class="empirical-point" cx="${x(value)}" cy="${y}" r="5"/>`}`;
  }).join('');
  return svg('Prior mean, observed proportion and posterior mean on a shared probability scale', marks + '<text x="12" y="151">0</text><text x="388" y="151" text-anchor="end">1</text>', 160);
}
