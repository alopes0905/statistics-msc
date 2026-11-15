import { buildContingencyTable } from './dataset.js';
import { chiSquareSurvival } from './chi-square.js';

function sum(values) {
  let total = 0, compensation = 0;
  for (const value of values) {
    const adjusted = value - compensation, next = total + adjusted;
    compensation = (next - total) - adjusted; total = next;
  }
  return total;
}

// #region frequencies
export function computeFrequencies(table) {
  const { observed, rowTotals, columnTotals, N } = table;
  return {
    joint: observed.map(row => row.map(value => value / N)),
    marginalX: rowTotals.map(value => value / N),
    marginalF: columnTotals.map(value => value / N),
    FgivenX: observed.map((row, i) => row.map(value => value / rowTotals[i])),
    XgivenF: observed.map(row => row.map((value, j) => value / columnTotals[j]))
  };
}
// #endregion frequencies

// #region pearson-test
export function computePearson(table) {
  const { observed, rowTotals, columnTotals, N } = table;
  // Divide first so the integer product need not lie within the safe-integer range.
  const expected = rowTotals.map(row => columnTotals.map(column => row * (column / N)));
  const residuals = observed.map((row, i) => row.map((value, j) => (value - expected[i][j]) / Math.sqrt(expected[i][j])));
  const contributions = observed.map((row, i) => row.map((value, j) => (value - expected[i][j]) ** 2 / expected[i][j]));
  const statistic = sum(contributions.flat());
  const df = (observed.length - 1) * (columnTotals.length - 1);
  const rawV = Math.sqrt((statistic / N) / Math.min(observed.length - 1, columnTotals.length - 1));
  if (!Number.isFinite(statistic) || !Number.isFinite(rawV) || rawV > 1 + 1e-12) throw new RangeError('Invalid Pearson statistic or effect size.');
  const tolerance = 64 * Number.EPSILON * N;
  const rowError = Math.max(...expected.map((row, i) => Math.abs(sum(row) - rowTotals[i])));
  const columnError = Math.max(...columnTotals.map((value, j) => Math.abs(sum(expected.map(row => row[j])) - value)));
  const totalError = Math.abs(sum(expected.flat()) - N);
  if (Math.max(rowError, columnError, totalError) > tolerance) throw new RangeError('Expected margins failed numerical verification.');
  return { expected, residuals, contributions, statistic, df, V: Math.min(1, rawV), marginsVerified: true };
}
// #endregion pearson-test

export function checkExpectedCounts(expected) {
  const cells = expected.flat();
  if (!cells.length || cells.some(value => !Number.isFinite(value) || value <= 0)) throw new RangeError('Expected counts must be finite and positive.');
  const below5 = cells.filter(value => value < 5).length;
  const below1 = cells.filter(value => value < 1).length;
  return { minimum: Math.min(...cells), cells: cells.length, below5, percentBelow5: 100 * below5 / cells.length, below1,
    allAtLeast5: below5 === 0, broaderGuidance: below1 === 0 && below5 * 5 <= cells.length };
}

export function testDecision(p, alpha, diagnostics) {
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) throw new RangeError('Significance level must be strictly between 0 and 1.');
  if (!Number.isFinite(p.value) || p.value < 0 || p.value > 1 || !Number.isFinite(p.logValue) || p.logValue > 0) throw new RangeError('Invalid p-value.');
  // The numeric comparison includes the exact p = alpha boundary; log handles underflow.
  const reject = p.underflow ? p.logValue <= Math.log(alpha) : p.value <= alpha;
  return { reject, qualified: !diagnostics.allAtLeast5, alpha };
}

export function analyzeIndependence(records, alpha = 0.05) {
  const table = buildContingencyTable(records);
  const frequencies = computeFrequencies(table), pearson = computePearson(table);
  const diagnostics = checkExpectedCounts(pearson.expected);
  const p = chiSquareSurvival(pearson.statistic, pearson.df);
  const decision = testDecision(p, alpha, diagnostics);
  return { table, frequencies, ...pearson, diagnostics, p, decision };
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) throw new RangeError('Only finite results can be formatted.');
  if (value === 0) return '0';
  return Math.abs(value) < 0.0001 || Math.abs(value) >= 1e7 ? value.toExponential(7) : Number(value.toPrecision(9)).toString();
}

export function formatP(p) { return p.underflow ? '< 4.941e−324 (below floating-point range)' : formatNumber(p.value); }

export function interpretation(result) {
  const { table, p, statistic, df, V, decision, diagnostics } = result;
  const comparison = decision.reject ? '≤' : '>';
  const numerical = `χ² = ${formatNumber(statistic)}, df = ${df}, asymptotic p ${p.underflow ? '' : '= '}${formatP(p)}; p ${comparison} α = ${decision.alpha}. Cramér’s V = ${formatNumber(V)}.`;
  if (decision.qualified) return `${numerical} Small expected counts make this asymptotic p-value potentially unreliable. The formal comparison would ${decision.reject ? 'reject' : 'fail to reject'} H₀, but I withhold an unqualified inference. ${table.rows.length === 2 && table.columns.length === 2 ? 'Fisher’s exact test may be appropriate for this small 2×2 table. ' : ''}Descriptive frequencies and Pearson’s statistic remain available; no categories were merged. Minimum E = ${formatNumber(diagnostics.minimum)}.`;
  const exact = statistic === 0 ? 'The sample table matches the empirical independence model exactly. ' : '';
  return `${numerical} ${exact}${decision.reject ? 'Reject H₀: the data provide statistically significant evidence of association' : 'Fail to reject H₀: there is insufficient evidence of association'} at this α, conditional on independent observational units and an appropriate sampling design. This does not prove population independence or establish causality.`;
}
