// Conservative bounds for a compact plot with a linear θ axis.
const MIN_SHAPE = 0.5;
const MAX_SHAPE = 128;
const ENDPOINT_GAP = 0.005;
const MAX_OPPOSITE_SHAPE = 20;
const STIRLING_COEFFICIENTS = [1 / 12, -1 / 360, 1 / 1260, -1 / 1680, 1 / 1188, -691 / 360360];

export function logGamma(value) {
  if (!Number.isFinite(value) || value < MIN_SHAPE || value > 2 * MAX_SHAPE) {
    throw new RangeError('Log-gamma requires a finite argument from 0.5 to 256.');
  }
  // Recurrence Γ(z+1) = zΓ(z) moves the argument into the range of the Stirling expansion.
  let z = value;
  let shift = 0;
  while (z < 16) {
    shift += Math.log(z);
    z += 1;
  }
  // DLMF 5.11.1 through z⁻¹¹, at z ≥ 16.
  const correction = STIRLING_COEFFICIENTS.reduce((sum, c, i) => sum + c / z ** (2 * i + 1), 0);
  return (z - 0.5) * Math.log(z) - z + Math.log(2 * Math.PI) / 2 + correction - shift;
}

function supportedShape(value) {
  return Number.isFinite(value) && value >= MIN_SHAPE && value <= MAX_SHAPE;
}

// #region beta-density
export function logBeta(a, b) {
  if (![a, b].every(supportedShape)) throw new RangeError('Density evaluation requires shapes from 0.5 to 128.');
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

export function betaDensity(a, b) {
  const normalizer = logBeta(a, b);
  return x => {
    if (!Number.isFinite(x) || x < 0 || x > 1) throw new RangeError('Success probability θ must be within [0,1].');
    if (x === 0) return a < 1 ? Infinity : a === 1 ? b : 0;
    if (x === 1) return b < 1 ? Infinity : b === 1 ? a : 0;
    return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) - normalizer);
  };
}
// #endregion beta-density

/** The prior and posterior come from the validated Beta update for these counts. */
export function densityComparison({ prior, posterior }, n, successes) {
  const shapes = [
    [prior.alpha, prior.beta],
    [successes + 1, n - successes + 1],
    [posterior.alpha, posterior.beta]
  ];
  const leftSingularity = shapes.some(([a]) => a < 1);
  const rightSingularity = shapes.some(([, b]) => b < 1);
  const unsupported = shapes.some(([a, b]) =>
    !supportedShape(a) || !supportedShape(b) ||
    (a < 1 && b > MAX_OPPOSITE_SHAPE) || (b < 1 && a > MAX_OPPOSITE_SHAPE)
  );
  const endpoints = [
    leftSingularity ? 'θ = 0' : null,
    rightSingularity ? 'θ = 1' : null
  ].filter(Boolean).join(' and ');
  const empty = n === 0 ? ' With no observations, the prior and posterior coincide and the rescaled likelihood is uniform.' : '';
  if (unsupported) {
    const reason = endpoints ? ` A density diverges at ${endpoints}.` : '';
    return {
      curves: null,
      note: `Showing means because a density falls outside the plotting range. The plot uses shapes from 0.5 to 128, with an opposite shape of at most 20 for a divergent endpoint.${reason}${empty}`
    };
  }

  const curves = shapes.map(([a, b]) => {
    const left = a < 1 ? ENDPOINT_GAP : 0;
    const right = b < 1 ? 1 - ENDPOINT_GAP : 1;
    // Cluster samples near the ends and include the exact mode for bounded interior peaks.
    const grid = Array.from({ length: 321 }, (_, i) =>
      left + (right - left) * (1 - Math.cos(Math.PI * i / 320)) / 2
    );
    if (a > 1 && b > 1) grid.push((a - 1) / (a + b - 2));
    grid.sort((x, y) => x - y);
    const density = betaDensity(a, b);
    return grid.map(x => [x, density(x)]);
  });
  const notes = [];
  if (leftSingularity) notes.push('Densities that diverge at θ = 0 are plotted from θ = 0.005.');
  if (rightSingularity) notes.push('Densities that diverge at θ = 1 are plotted through θ = 0.995.');
  if (n === 0) notes.push('With no observations, the prior and posterior coincide and the rescaled likelihood is uniform.');
  return { curves, note: notes.join(' ') };
}
