export const MIN_CELL_DEFAULT = 30;

function safeDivide(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

function mean(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function binary(value) {
  return value === 1 || value === "1" || value === true;
}

export function auc(rows, scoreField = "predicted_risk_2y", outcomeField = "outcome_2y") {
  const valid = rows
    .map((row) => ({ score: Number(row[scoreField]), outcome: Number(row[outcomeField]) }))
    .filter((row) => Number.isFinite(row.score) && (row.outcome === 0 || row.outcome === 1))
    .sort((a, b) => a.score - b.score);
  const positives = valid.filter((row) => row.outcome === 1).length;
  const negatives = valid.length - positives;
  if (!positives || !negatives) return null;
  let rankSum = 0;
  let index = 0;
  while (index < valid.length) {
    let end = index + 1;
    while (end < valid.length && valid[end].score === valid[index].score) end += 1;
    const averageRank = (index + 1 + end) / 2;
    for (let cursor = index; cursor < end; cursor += 1) {
      if (valid[cursor].outcome === 1) rankSum += averageRank;
    }
    index = end;
  }
  return (rankSum - positives * (positives + 1) / 2) / (positives * negatives);
}

export function performance(rows, threshold = 0.2) {
  let tp = 0; let tn = 0; let fp = 0; let fn = 0;
  let predicted = 0; let observed = 0; let brierSum = 0; let n = 0;
  for (const row of rows) {
    const score = Number(row.predicted_risk_2y);
    const outcome = Number(row.outcome_2y);
    if (!Number.isFinite(score) || ![0, 1].includes(outcome)) continue;
    const flagged = score >= threshold;
    if (flagged && outcome) tp += 1;
    if (!flagged && !outcome) tn += 1;
    if (flagged && !outcome) fp += 1;
    if (!flagged && outcome) fn += 1;
    predicted += score;
    observed += outcome;
    brierSum += (score - outcome) ** 2;
    n += 1;
  }
  return {
    n,
    events: observed,
    eventRate: safeDivide(observed, n),
    selectionRate: safeDivide(tp + fp, n),
    sensitivity: safeDivide(tp, tp + fn),
    specificity: safeDivide(tn, tn + fp),
    fpr: safeDivide(fp, fp + tn),
    fnr: safeDivide(fn, fn + tp),
    ppv: safeDivide(tp, tp + fp),
    brier: safeDivide(brierSum, n),
    calibrationRatio: safeDivide(observed, predicted),
    auc: auc(rows),
    confusion: { tp, tn, fp, fn }
  };
}

export function directionalFairness(referenceRows, comparisonRows, threshold = 0.2) {
  const reference = performance(referenceRows, threshold);
  const comparison = performance(comparisonRows, threshold);
  const gap = (field) => comparison[field] == null || reference[field] == null
    ? null
    : comparison[field] - reference[field];
  return {
    reference,
    comparison,
    statisticalParityDifference: gap("selectionRate"),
    truePositiveRateDifference: gap("sensitivity"),
    trueNegativeRateDifference: gap("specificity"),
    falsePositiveRateDifference: gap("fpr"),
    falseNegativeRateDifference: gap("fnr"),
    positivePredictiveValueDifference: gap("ppv"),
    aucDifference: gap("auc"),
    brierDifference: gap("brier"),
    calibrationRatioDifference: gap("calibrationRatio"),
    disparateImpactRatio: safeDivide(comparison.selectionRate, reference.selectionRate),
    equalizedOddsGap: Math.max(
      Math.abs(gap("sensitivity") ?? 0),
      Math.abs(gap("fpr") ?? 0)
    )
  };
}

export function groupCounts(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const label = row[field] == null || row[field] === "" ? "Missing" : String(row[field]);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([group, count]) => ({ group, count, share: count / rows.length }))
    .sort((a, b) => b.count - a.count);
}

export function missingnessByGroup(rows, groupField, fields) {
  const groups = groupCounts(rows, groupField).map(({ group }) => group);
  return groups.flatMap((group) => {
    const subset = rows.filter((row) => (row[groupField] == null || row[groupField] === "" ? "Missing" : String(row[groupField])) === group);
    return fields.map((field) => ({
      group,
      field,
      n: subset.length,
      missing: subset.filter((row) => row[field] == null || row[field] === "").length,
      rate: safeDivide(subset.filter((row) => row[field] == null || row[field] === "").length, subset.length)
    }));
  });
}

export function careRates(rows, groupField, minCell = MIN_CELL_DEFAULT) {
  const definitions = [
    ["Molecular testing", "molecular_test_completed", "molecular_test_eligible"],
    ["Treatment receipt", "treatment_received", "treatment_eligible"],
    ["Treatment adherence", "treatment_adherent", "treatment_received"],
    ["Follow-up completion", "followup_complete", null],
    ["Psychosocial screening", "psychosocial_screen_completed", "psychosocial_screen_eligible"],
    ["Survivorship care plan", "survivorship_plan_completed", "survivorship_plan_eligible"],
    ["Fertility-risk assessment", "fertility_risk_assessed", "fertility_risk_assessment_eligible"],
    ["Fertility-preservation discussion", "fertility_preservation_discussed", "fertility_preservation_eligible"],
    ["Fertility-preservation completion", "fertility_preservation_completed", "fertility_preservation_discussed"]
  ];
  const groups = groupCounts(rows, groupField).map(({ group }) => group);
  return groups.flatMap((group) => {
    const grouped = rows.filter((row) => String(row[groupField] ?? "Missing") === group);
    return definitions.map(([label, outcome, eligible]) => {
      const denominator = grouped.filter((row) => {
        if (row[outcome] == null) return false;
        return eligible ? binary(row[eligible]) : true;
      });
      const numerator = denominator.filter((row) => binary(row[outcome])).length;
      return {
        group,
        measure: label,
        numerator,
        denominator: denominator.length,
        rate: denominator.length >= minCell ? safeDivide(numerator, denominator.length) : null,
        suppressed: denominator.length < minCell
      };
    });
  });
}

export function groupPerformance(rows, groupField, threshold, minCell = MIN_CELL_DEFAULT) {
  return groupCounts(rows, groupField).map(({ group }) => {
    const subset = rows.filter((row) => String(row[groupField] ?? "Missing") === group);
    return {
      group,
      count: subset.length,
      suppressed: subset.length < minCell,
      metrics: subset.length < minCell ? null : performance(subset, threshold)
    };
  });
}

export function riskHistogram(rows, binCount = 20, scoreField = "predicted_risk_2y") {
  const bins = Array.from({ length: binCount }, (_, index) => ({
    lower: index / binCount,
    upper: (index + 1) / binCount,
    count: 0,
    share: 0
  }));
  let valid = 0;
  for (const row of rows) {
    const score = Number(row[scoreField]);
    if (!Number.isFinite(score) || score < 0 || score > 1) continue;
    const index = Math.min(binCount - 1, Math.floor(score * binCount));
    bins[index].count += 1;
    valid += 1;
  }
  for (const bin of bins) bin.share = valid ? bin.count / valid : 0;
  return bins;
}

export function calibrationBins(rows, binCount = 10, scoreField = "predicted_risk_2y", outcomeField = "outcome_2y") {
  const bins = Array.from({ length: binCount }, (_, index) => ({
    lower: index / binCount,
    upper: (index + 1) / binCount,
    n: 0,
    predictedSum: 0,
    observedSum: 0
  }));
  for (const row of rows) {
    const score = Number(row[scoreField]);
    const outcome = Number(row[outcomeField]);
    if (!Number.isFinite(score) || score < 0 || score > 1 || ![0, 1].includes(outcome)) continue;
    const index = Math.min(binCount - 1, Math.floor(score * binCount));
    bins[index].n += 1;
    bins[index].predictedSum += score;
    bins[index].observedSum += outcome;
  }
  return bins.map(({ lower, upper, n, predictedSum, observedSum }) => ({
    lower,
    upper,
    n,
    meanPredicted: n ? predictedSum / n : null,
    observedRate: n ? observedSum / n : null
  }));
}

export const __test__ = { safeDivide, mean };
