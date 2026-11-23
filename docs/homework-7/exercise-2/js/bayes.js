function probability(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${label} must be between 0 and 1.`);
}

export function conditional(joint, evidence) {
  probability(joint, 'Joint probability');
  probability(evidence, 'Evidence probability');
  if (joint > evidence) throw new RangeError('The joint probability cannot exceed the evidence probability.');
  return evidence === 0 ? null : joint / evidence;
}

// #region bayes-update
/** Hypotheses form a partition. Each likelihood describes the same fixed evidence. */
export function updateHypotheses(priors, likelihoods) {
  if (!priors.length || priors.length !== likelihoods.length) throw new RangeError('Each hypothesis needs a prior and likelihood.');
  priors.forEach(value => probability(value, 'Prior'));
  likelihoods.forEach(value => probability(value, 'Likelihood'));
  const total = priors.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 8 * Number.EPSILON) throw new RangeError('Priors must sum to 1.');
  const weights = priors.map((value, i) => value * likelihoods[i] / total);
  const evidence = weights.reduce((sum, value) => sum + value, 0);

  // Rescale in log space when tiny joint probabilities lose precision or underflow.
  let scaled = weights;
  if (evidence < 1e-300) {
    const logs = priors.map((value, i) => Math.log(value) + Math.log(likelihoods[i]));
    const peak = Math.max(...logs);
    if (peak === -Infinity) return { evidence: 0, weights, posterior: null, underflow: false };
    scaled = logs.map(value => Math.exp(value - peak));
  }
  const scale = scaled.reduce((sum, value) => sum + value, 0);
  return { evidence, weights, posterior: scaled.map(value => value / scale), underflow: evidence === 0 };
}
// #endregion bayes-update

function odds(numerator, denominator) {
  if (!denominator) return numerator ? 'Unbounded' : 'Undefined';
  const ratio = numerator / denominator;
  return Number.isFinite(ratio) ? ratio : 'Above numerical range';
}

export function analyzeAlert(prior, sensitivity, falsePositive) {
  probability(prior, 'Intrusion prior');
  probability(sensitivity, 'Sensitivity');
  probability(falsePositive, 'False-positive rate');
  const priors = [prior, 1 - prior];
  const positive = updateHypotheses(priors, [sensitivity, falsePositive]);
  const negative = updateHypotheses(priors, [1 - sensitivity, 1 - falsePositive]);
  return {
    prior, sensitivity, falsePositive, positive, negative,
    confusion: [
      [positive.weights[0] * 10000, negative.weights[0] * 10000],
      [positive.weights[1] * 10000, negative.weights[1] * 10000]
    ],
    likelihoodRatio: odds(sensitivity, falsePositive),
    priorOdds: odds(prior, 1 - prior),
    posteriorOdds: positive.posterior === null ? 'Undefined' : odds(...positive.posterior)
  };
}

export function betaMoments(alpha, beta) {
  if (![alpha, beta].every(value => Number.isFinite(value) && value > 0 && value <= 1e6)) {
    throw new RangeError('Beta shape parameters must be positive and at most 1,000,000.');
  }
  return moments(alpha, beta);
}

function moments(alpha, beta) {
  const concentration = alpha + beta;
  const mean = alpha / concentration;
  const variance = mean * (beta / concentration) / (concentration + 1);
  return { alpha, beta, concentration, mean, variance };
}

// #region beta-update
export function updateBeta(alpha, beta, n, successes) {
  const prior = betaMoments(alpha, beta);
  if (!Number.isInteger(n) || n < 0 || n > 10000) throw new RangeError('Trial count n must be an integer from 0 to 10,000.');
  if (!Number.isInteger(successes) || successes < 0 || successes > n) throw new RangeError('Success count s must be an integer from 0 to n.');
  const posterior = moments(alpha + successes, beta + (n - successes));
  return { prior, posterior, sampleProportion: n === 0 ? null : successes / n, predictive: posterior.mean };
}
// #endregion beta-update

export function sequentialBeta(alpha, beta, outcomes) {
  betaMoments(alpha, beta);
  if (!Array.isArray(outcomes) || outcomes.length > 10000) throw new RangeError('At most 10,000 binary outcomes are supported.');
  for (const outcome of outcomes) {
    if (outcome !== 0 && outcome !== 1) throw new RangeError('Each outcome must be 0 or 1.');
    alpha += outcome;
    beta += 1 - outcome;
  }
  return moments(alpha, beta);
}
