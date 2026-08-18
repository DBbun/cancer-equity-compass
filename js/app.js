import { generateCohort, SCENARIOS } from "./synthetic.js?v=20260818-4";
import {
  MIN_CELL_DEFAULT,
  performance,
  directionalFairness,
  groupCounts,
  missingnessByGroup,
  careRates,
  groupPerformance,
  riskHistogram,
  calibrationBins,
  welchTTest,
  mannWhitneyTest,
  chiSquareTest,
  wilsonInterval
} from "./metrics.js?v=20260818-2";
import { parseCsv, toCsv, toCcdiDemonstrationBundle, validateRows, REQUIRED_FIELDS } from "./adapter.js";
import { buildAuditReport } from "./report.js";

let cohort = [];
let source = "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const formatPercent = (value, digits = 1) => value == null ? "—" : `${(value * 100).toFixed(digits)}%`;
const formatNumber = (value, digits = 2) => value == null || Number.isNaN(value) ? "—" : Number(value).toFixed(digits);
const formatP = (value) => value == null ? "—" : value < 0.001 ? "<0.001" : value.toFixed(3);
const formatRateInterval = (rate, successes, total) => {
  const [lower, upper] = wilsonInterval(successes, total);
  return `${formatPercent(rate)} [${formatPercent(lower)}–${formatPercent(upper)}]`;
};
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function kpi(label, value, detail) {
  return `<div class="kpi"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b><small>${escapeHtml(detail)}</small></div>`;
}

function currentGroupField(panel = "readiness") {
  if (panel === "fairness") return $("#fairness-field").value;
  return $(`#${panel} .group-field`).value;
}

function quantile(values, probability) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position); const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function describeContinuous(rows, field, percent = false) {
  const values = rows.map((row) => Number(row[field])).filter(Number.isFinite);
  if (!values.length) return "—";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / Math.max(1, values.length - 1));
  const scale = percent ? 100 : 1; const suffix = percent ? "%" : "";
  return `${(average * scale).toFixed(1)}${suffix} (${(sd * scale).toFixed(1)})<br><small>median ${(quantile(values, .5) * scale).toFixed(1)}${suffix} [${(quantile(values, .25) * scale).toFixed(1)}–${(quantile(values, .75) * scale).toFixed(1)}]</small>`;
}

function describeCategorical(rows, field) {
  const counts = new Map();
  for (const row of rows) { const value = String(row[field] ?? "Missing"); counts.set(value, (counts.get(value) || 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => `${escapeHtml(value)}: ${count.toLocaleString()} (${formatPercent(count / rows.length)})`).join("<br>");
}

function refreshTable1Groups() {
  if (!cohort.length) return;
  const field = $("#table1-field").value;
  const groups = groupCounts(cohort, field).filter((row) => row.group !== "Missing");
  const previousA = $("#table1-reference").value; const previousB = $("#table1-comparison").value;
  const options = groups.map((row) => `<option value="${escapeHtml(row.group)}">${escapeHtml(row.group)} (n=${row.count.toLocaleString()})</option>`).join("");
  $("#table1-reference").innerHTML = options; $("#table1-comparison").innerHTML = options;
  $("#table1-reference").value = groups.some((row) => row.group === previousA) ? previousA : groups[0]?.group ?? "";
  $("#table1-comparison").value = groups.some((row) => row.group === previousB) ? previousB : groups[1]?.group ?? groups[0]?.group ?? "";
}

function renderTable1() {
  if (!cohort.length) return;
  const field = $("#table1-field").value; const groupAName = $("#table1-reference").value; const groupBName = $("#table1-comparison").value;
  const groupA = cohort.filter((row) => String(row[field] ?? "Missing") === groupAName); const groupB = cohort.filter((row) => String(row[field] ?? "Missing") === groupBName);
  if (!groupA.length || !groupB.length) return;
  const continuous = [
    ["Age at diagnosis, years", "age_at_diagnosis", false],
    ["Years since diagnosis", "years_since_diagnosis", false],
    ["Transition readiness", "transition_readiness", true],
    ["Predicted two-year risk", "predicted_risk_2y", true]
  ];
  const categorical = [
    ["Sex", "sex"], ["Cancer type", "cancer_type"], ["Cancer risk group", "risk_group"], ["Disease stage", "disease_stage"],
    ["Care model", "care_model"], ["Treatment received", "treatment_received"], ["Treatment adherent", "treatment_adherent"],
    ["Follow-up complete", "followup_complete"], ["Two-year adverse outcome", "outcome_2y"]
  ];
  const rows = [];
  for (const [label, variable, percent] of continuous) {
    const firstValues = groupA.map((row) => row[variable]); const secondValues = groupB.map((row) => row[variable]);
    const t = welchTTest(firstValues, secondValues); const u = mannWhitneyTest(firstValues, secondValues);
    rows.push([label, describeContinuous(groupA, variable, percent), describeContinuous(groupB, variable, percent), `Welch t=${formatNumber(t.statistic)}; p=${formatP(t.pValue)}<br><small>Mann-Whitney U=${formatNumber(u.statistic, 0)}; p=${formatP(u.pValue)}</small>`]);
  }
  for (const [label, variable] of categorical) {
    const result = chiSquareTest(groupA, groupB, variable);
    rows.push([label, describeCategorical(groupA, variable), describeCategorical(groupB, variable), `χ²=${formatNumber(result.statistic)}; p=${formatP(result.pValue)}`]);
  }
  $("#table1-summary").innerHTML = `<div class="table-one-summary"><b>Comparison:</b> ${escapeHtml(groupAName)} (n=${groupA.length.toLocaleString()}) versus ${escapeHtml(groupBName)} (n=${groupB.length.toLocaleString()}). <b>Scope:</b> demographics, cancer characteristics, care, and outcomes. Tests are descriptive checks of the generated data-generating process.</div>`;
  $("#table1").innerHTML = `<table><thead><tr><th>Characteristic / outcome</th><th>${escapeHtml(groupAName)}<br><small>n=${groupA.length.toLocaleString()}</small></th><th>${escapeHtml(groupBName)}<br><small>n=${groupB.length.toLocaleString()}</small></th><th>Statistical comparison</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td class="${index > 0 ? "numeric" : ""}">${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function updateScenarioDescription() {
  $("#scenario-description").textContent = SCENARIOS[$("#scenario").value].description;
}

function renderStatus() {
  const validation = validateRows(cohort);
  $("#dataset-status").textContent = cohort.length
    ? `${cohort.length.toLocaleString()} records · ${source} · ${validation.valid ? "schema valid" : "validation issue"}`
    : "No cohort loaded";
  $("#download-csv").disabled = !cohort.length || source !== "Synthetic";
  $("#download-json").disabled = !cohort.length || source !== "Synthetic";
}

function renderReadiness() {
  if (!cohort.length) return;
  const field = currentGroupField("readiness");
  const counts = groupCounts(cohort, field);
  const missingFields = ["race_ethnicity", "molecular_test_completed", "treatment_adherent", "followup_complete", "psychosocial_screen_completed", "survivorship_plan_completed"];
  const missingness = missingnessByGroup(cohort, field, missingFields);
  const reportableCounts = counts.filter((row) => row.group !== "Missing");
  const smallestRow = [...reportableCounts].sort((a, b) => a.count - b.count)[0];
  const invalid = validateRows(cohort);
  const overallMissing = missingness.reduce((sum, row) => sum + row.missing, 0) / Math.max(1, missingness.reduce((sum, row) => sum + row.n, 0));
  $("#readiness-kpis").innerHTML = [
    kpi("Participants", cohort.length.toLocaleString(), "Rows in the active cohort"),
    kpi("Population groups", String(counts.length), field.replaceAll("_", " ")),
    kpi("Smallest group", smallestRow ? `${smallestRow.group}: ${smallestRow.count.toLocaleString()}` : "—", smallestRow?.count < MIN_CELL_DEFAULT ? "Below default reporting threshold" : `Among ${reportableCounts.length} displayed groups; ${formatPercent(smallestRow?.share)} of cohort`),
    kpi("Selected-field missingness", formatPercent(overallMissing), invalid.valid ? "Canonical validation passed" : `${invalid.errors.length} validation issue(s)`)
  ].join("");
  $("#representation-chart").innerHTML = counts.map((row) => `<div class="bar-row"><span>${escapeHtml(row.group)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(1, row.share * 100)}%"></div></div><b>${formatPercent(row.share, 0)}</b></div>`).join("");
  renderMissingnessHeatmap(missingness, missingFields);
  const largest = reportableCounts[0];
  $("#representation-explanation").innerHTML = `<b>What this means</b><p>${escapeHtml(largest.group)} is the largest displayed group (${largest.count.toLocaleString()}, ${formatPercent(largest.share)}), while ${escapeHtml(smallestRow.group)} is the smallest (${smallestRow.count.toLocaleString()}, ${formatPercent(smallestRow.share)}). Large size imbalances can make pooled performance look stable while estimates for smaller groups remain uncertain.</p><b>Possible actions</b><p>Review recruitment and contribution by site, predefine minimum subgroup sizes, report confidence intervals, combine categories only with scientific justification, and avoid interpreting suppressed or sparse intersections.</p>`;
  const worstMissing = [...missingness].sort((a, b) => b.rate - a.rate)[0];
  $("#missingness-explanation").innerHTML = `<b>What this means</b><p>The highest missingness is ${formatPercent(worstMissing.rate)} for ${escapeHtml(worstMissing.field.replaceAll("_", " "))} in ${escapeHtml(worstMissing.group)} (${worstMissing.missing.toLocaleString()} of ${worstMissing.n.toLocaleString()}). Missingness can bias care and fairness estimates when it differs by population or relates to outcomes.</p><b>Possible actions</b><p>Trace missing values to source systems and workflow stages, compare complete-case and missingness-aware analyses, add explicit unknown categories where appropriate, and avoid treating undocumented care as care not received.</p>`;
}

function renderCare() {
  if (!cohort.length) return;
  const field = currentGroupField("care");
  const rows = careRates(cohort, field);
  renderCareCharts(rows);
}

function renderMissingnessHeatmap(rows, fields) {
  const groups = [...new Set(rows.map((row) => row.group))];
  const labels = Object.fromEntries(fields.map((field) => [field, field.replaceAll("_", " ")]));
  const lookup = new Map(rows.map((row) => [`${row.group}|${row.field}`, row]));
  const maxRate = Math.max(0.01, ...rows.map((row) => row.rate || 0));
  const header = `<div class="heatmap-cell heatmap-corner">Population</div>${fields.map((field) => `<div class="heatmap-cell heatmap-header">${escapeHtml(labels[field])}</div>`).join("")}`;
  const body = groups.map((group) => {
    const n = lookup.get(`${group}|${fields[0]}`)?.n ?? 0;
    const cells = fields.map((field) => {
      const row = lookup.get(`${group}|${field}`);
      const intensity = row?.rate ? 0.12 + 0.88 * row.rate / maxRate : 0;
      const foreground = intensity > 0.56 ? "#fff" : "#102f2a";
      const background = row?.rate ? `rgba(158,59,45,${intensity.toFixed(2)})` : "#edf3f1";
      return `<div class="heatmap-cell heatmap-value" style="background:${background};color:${foreground}" title="${escapeHtml(group)} — ${escapeHtml(labels[field])}: ${(row?.missing ?? 0).toLocaleString()} missing of ${(row?.n ?? 0).toLocaleString()} (${formatPercent(row?.rate)})"><b>${formatPercent(row?.rate)}</b></div>`;
    }).join("");
    return `<div class="heatmap-cell heatmap-row-label"><b>${escapeHtml(group)}</b><small>n=${n.toLocaleString()}</small></div>${cells}`;
  }).join("");
  $("#missingness-table").innerHTML = `<div class="heatmap" style="--heatmap-fields:${fields.length}">${header}${body}</div><div class="heatmap-legend"><span>0% missing</span><i></i><span>${formatPercent(maxRate)} or higher</span></div>`;
}

function renderCareCharts(rows) {
  const valid = rows.filter((row) => !row.suppressed && row.rate != null);
  const groups = [...new Set(valid.map((row) => row.group))];
  const measures = [...new Set(valid.map((row) => row.measure))];
  const reference = groups[0];
  const refRates = new Map(valid.filter((row) => row.group === reference).map((row) => [row.measure, row.rate]));
  const gaps = valid.filter((row) => row.group !== reference).map((row) => ({ ...row, gap: row.rate - (refRates.get(row.measure) ?? row.rate) }));
  const worst = [...gaps].sort((a, b) => a.gap - b.gap)[0];
  $("#care-headline").innerHTML = worst ? `<b>Largest synthetic care-gap signal:</b> ${escapeHtml(worst.group)} has ${Math.abs(worst.gap * 100).toFixed(1)} percentage points lower ${escapeHtml(worst.measure.toLowerCase())} than ${escapeHtml(reference)} (${worst.numerator.toLocaleString()} of ${worst.denominator.toLocaleString()} completed).` : "No reportable comparison is available.";
  const colors = ["#2e7d78", "#f46b45", "#785aa8", "#d49b26", "#4382b8", "#9e3b2d"];
  const rateRows = measures.map((measure) => ({
    label: measure,
    values: groups.map((group) => valid.find((row) => row.group === group && row.measure === measure)?.rate ?? null),
    tooltips: groups.map((group) => {
      const row = valid.find((candidate) => candidate.group === group && candidate.measure === measure);
      return row ? `${group}: ${formatPercent(row.rate)} (${row.numerator.toLocaleString()} of ${row.denominator.toLocaleString()}); 95% CI ${formatPercent(row.confidenceInterval[0])}–${formatPercent(row.confidenceInterval[1])}` : "Not reportable";
    })
  }));
  $("#care-rate-chart").innerHTML = horizontalGroupedBars(rateRows, groups, colors, { percent: true, minWidth: 620 });
  const gapRows = measures.map((measure) => ({ label: measure, values: groups.slice(1).map((group) => gaps.find((row) => row.group === group && row.measure === measure)?.gap ?? null) }));
  $("#care-gap-chart").innerHTML = divergingBars(gapRows, groups.slice(1), colors.slice(1));
  const cascadeMeasures = ["Treatment receipt", "Treatment adherence", "Follow-up completion", "Survivorship care plan"];
  const cascadeRows = cascadeMeasures.map((measure) => ({ label: measure, values: groups.map((group) => valid.find((row) => row.group === group && row.measure === measure)?.rate ?? null) }));
  $("#care-cascade-chart").innerHTML = lineCategoryChart(cascadeRows, groups, colors);
  $("#care-rate-explanation").innerHTML = `<b>What this means</b><p>Each bar uses only participants eligible for that care process. Hovering shows the numerator, denominator, rate, and 95% confidence interval. The chart identifies where completion differs, but it does not establish why.</p><b>Possible actions</b><p>Audit eligibility rules, referral documentation, insurance and language support, and site workflows. Confirm that lower completion is not caused by coding differences or contraindications before designing an intervention.</p>`;
  $("#care-gap-explanation").innerHTML = `<b>What this means</b><p>${worst ? `${escapeHtml(worst.group)} has the largest negative signal: ${Math.abs(worst.gap * 100).toFixed(1)} percentage points lower ${escapeHtml(worst.measure.toLowerCase())} than ${escapeHtml(reference)}.` : "No reportable gap is available."} Zero is parity with the selected reference; direction and clinical need must be considered together.</p><b>Possible actions</b><p>Prioritize the largest clinically meaningful gaps, reproduce them within diagnosis and risk strata, calculate adjusted estimates, and engage affected patients and care teams before attributing causality.</p>`;
  $("#care-cascade-explanation").innerHTML = `<b>What this means</b><p>The pathway view shows where completion falls between treatment receipt, adherence, follow-up, and survivorship planning. Diverging lines identify populations that may leave the pathway at different stages.</p><b>Possible actions</b><p>Target the earliest avoidable drop-off, add navigation or reminder support, improve transition handoffs, and monitor whether interventions close the gap without reducing appropriate care for another population.</p>`;
}

function refreshFairnessGroups() {
  if (!cohort.length) return;
  const field = currentGroupField("fairness");
  const groups = groupCounts(cohort, field).filter((row) => row.group !== "Missing" && row.count >= MIN_CELL_DEFAULT);
  const existingReference = $("#reference-group").value;
  const existingComparison = $("#comparison-group").value;
  const options = groups.map((row) => `<option value="${escapeHtml(row.group)}">${escapeHtml(row.group)} (n=${row.count.toLocaleString()})</option>`).join("");
  $("#reference-group").innerHTML = options;
  $("#comparison-group").innerHTML = options;
  $("#reference-group").value = groups.some((row) => row.group === existingReference) ? existingReference : groups[0]?.group ?? "";
  $("#comparison-group").value = groups.some((row) => row.group === existingComparison) ? existingComparison : groups[1]?.group ?? groups[0]?.group ?? "";
}

function renderFairness() {
  if (!cohort.length) return;
  const field = currentGroupField("fairness");
  const threshold = Number($("#threshold").value);
  $("#threshold-output").value = formatPercent(threshold, 0);
  const overall = performance(cohort, threshold);
  $("#performance-kpis").innerHTML = [
    kpi("Overall AUC", formatNumber(overall.auc), "Ranking across the full cohort"),
    kpi("Brier score", formatNumber(overall.brier, 3), "Mean squared probability error"),
    kpi("Observed ÷ expected", formatNumber(overall.calibrationRatio), "Overall calibration ratio"),
    kpi("Flagged at threshold", formatPercent(overall.selectionRate), `${formatPercent(threshold, 0)} decision threshold`)
  ].join("");
  const referenceName = $("#reference-group").value;
  const comparisonName = $("#comparison-group").value;
  const reference = cohort.filter((row) => String(row[field] ?? "Missing") === referenceName);
  const comparison = cohort.filter((row) => String(row[field] ?? "Missing") === comparisonName);
  const audit = directionalFairness(reference, comparison, threshold);
  renderModelCharts(reference, comparison, referenceName, comparisonName, threshold);
  renderAgeAndThresholdCharts(reference, comparison, referenceName, comparisonName);
  renderFairnessMetricChart(audit, referenceName, comparisonName);
  const definitions = [
    ["Statistical parity difference", audit.statisticalParityDifference, "Difference in the share classified above threshold"],
    ["Sensitivity difference", audit.truePositiveRateDifference, "Difference in detected cases among participants with the outcome"],
    ["Specificity difference", audit.trueNegativeRateDifference, "Difference in correctly unflagged non-cases"],
    ["False-positive-rate difference", audit.falsePositiveRateDifference, "Difference in unnecessary flags among non-cases"],
    ["False-negative-rate difference", audit.falseNegativeRateDifference, "Difference in missed cases"],
    ["PPV difference", audit.positivePredictiveValueDifference, "Difference in reliability of a positive classification"],
    ["Disparate-impact ratio", audit.disparateImpactRatio, "Comparison selection rate divided by reference", "ratio"],
    ["Equalized-odds gap", audit.equalizedOddsGap, "Largest absolute sensitivity or false-positive-rate gap"],
    ["Calibration-ratio difference", audit.calibrationRatioDifference, "Difference in observed-to-expected outcome ratio", "number"]
  ];
  $("#fairness-metrics").innerHTML = definitions.map(([label, value, note, kind]) => `<div class="metric"><span>${escapeHtml(label)}</span><b>${kind === "ratio" ? `${formatNumber(value)}×` : kind === "number" ? formatNumber(value) : formatPercent(value)}</b><small>${escapeHtml(note)}</small></div>`).join("");
  const groups = groupPerformance(cohort, field, threshold);
  $("#performance-table").innerHTML = table(
    ["Population", "N", "AUC", "O/E", "Sensitivity [95% CI]", "Specificity [95% CI]", "FNR [95% CI]", "Flagged [95% CI]"],
    groups.map((row) => row.suppressed
      ? [row.group, row.count.toLocaleString(), "Suppressed", "—", "—", "—", "—", "—"]
      : [row.group, row.count.toLocaleString(), formatNumber(row.metrics.auc), formatNumber(row.metrics.calibrationRatio), formatRateInterval(row.metrics.sensitivity, row.metrics.confusion.tp, row.metrics.confusion.tp + row.metrics.confusion.fn), formatRateInterval(row.metrics.specificity, row.metrics.confusion.tn, row.metrics.confusion.tn + row.metrics.confusion.fp), formatRateInterval(row.metrics.fnr, row.metrics.confusion.fn, row.metrics.confusion.fn + row.metrics.confusion.tp), formatRateInterval(row.metrics.selectionRate, row.metrics.confusion.tp + row.metrics.confusion.fp, row.metrics.n)]),
    (row) => row[2] === "Suppressed" ? "suppressed" : ""
  );
}

function differenceInterval(firstRate, firstN, secondRate, secondN) {
  if (firstRate == null || secondRate == null || !firstN || !secondN) return [null, null];
  const difference = secondRate - firstRate;
  const se = Math.sqrt(firstRate * (1 - firstRate) / firstN + secondRate * (1 - secondRate) / secondN);
  return [difference - 1.96 * se, difference + 1.96 * se];
}

function renderFairnessMetricChart(audit, referenceName, comparisonName) {
  const r = audit.reference; const c = audit.comparison;
  const measures = [
    { label: "Statistical parity difference", value: audit.statisticalParityDifference, ci: differenceInterval(r.selectionRate, r.n, c.selectionRate, c.n), meaning: "difference in model-positive rates" },
    { label: "True-positive-rate difference", value: audit.truePositiveRateDifference, ci: differenceInterval(r.sensitivity, r.confusion.tp + r.confusion.fn, c.sensitivity, c.confusion.tp + c.confusion.fn), meaning: "difference in sensitivity among outcome-positive records" },
    { label: "True-negative-rate difference", value: audit.trueNegativeRateDifference, ci: differenceInterval(r.specificity, r.confusion.tn + r.confusion.fp, c.specificity, c.confusion.tn + c.confusion.fp), meaning: "difference in specificity among outcome-negative records" },
    { label: "False-negative-rate difference", value: audit.falseNegativeRateDifference, ci: differenceInterval(r.fnr, r.confusion.tp + r.confusion.fn, c.fnr, c.confusion.tp + c.confusion.fn), meaning: "difference in missed-outcome rates" },
    { label: "False-positive-rate difference", value: audit.falsePositiveRateDifference, ci: differenceInterval(r.fpr, r.confusion.tn + r.confusion.fp, c.fpr, c.confusion.tn + c.confusion.fp), meaning: "difference in unnecessary model-positive classifications" }
  ];
  const width = 860; const height = 330; const labelWidth = 260; const center = 560; const scale = 850; const top = 28; const rowHeight = 52;
  const marks = measures.map((measure, index) => {
    const y = top + index * rowHeight; const x = center + measure.value * scale; const low = center + measure.ci[0] * scale; const high = center + measure.ci[1] * scale;
    return `${svgText(labelWidth - 8, y + 8, measure.label, "chart-label", "end")}<line x1="${low}" y1="${y}" x2="${high}" y2="${y}" stroke="#102f2a" stroke-width="2"/><line x1="${low}" y1="${y - 5}" x2="${low}" y2="${y + 5}" stroke="#102f2a"/><line x1="${high}" y1="${y - 5}" x2="${high}" y2="${y + 5}" stroke="#102f2a"/><circle cx="${x}" cy="${y}" r="6" fill="${measure.value < 0 ? "#9e3b2d" : "#2e7d78"}"><title>${escapeHtml(measure.label)}: ${(measure.value * 100).toFixed(1)} pp; 95% CI ${(measure.ci[0] * 100).toFixed(1)} to ${(measure.ci[1] * 100).toFixed(1)} pp; ${escapeHtml(measure.meaning)}</title></circle>`;
  }).join("");
  $("#fairness-metric-chart").innerHTML = `<svg class="audit-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Fairness differences with 95 percent confidence intervals"><line x1="${center}" y1="5" x2="${center}" y2="${height - 42}" class="threshold-line"/>${marks}${svgText(center, height - 22, "0 percentage points (parity)")}</svg>`;
  const largest = [...measures].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  $("#fairness-metric-explanation").innerHTML = `<b>What this means</b><p>Values are ${escapeHtml(comparisonName)} minus ${escapeHtml(referenceName)}. The largest absolute difference is ${escapeHtml(largest.label.toLowerCase())}: ${(largest.value * 100).toFixed(1)} percentage points (95% CI ${(largest.ci[0] * 100).toFixed(1)} to ${(largest.ci[1] * 100).toFixed(1)}). An interval crossing zero indicates that sampling uncertainty includes no difference.</p><b>Possible actions</b><p>Do not optimize statistical parity alone. Review sensitivity, true-negative rate, calibration, clinical consequences, and eligibility together; test multiple thresholds; and investigate whether predictors, labels, missingness, or care access create the observed pattern.</p>`;
}

function svgText(x, y, value, className = "chart-label", anchor = "middle") {
  return `<text x="${x}" y="${y}" class="${className}" text-anchor="${anchor}">${escapeHtml(value)}</text>`;
}

function chartLegend(referenceName, comparisonName, includeIdeal = false) {
  return `<div class="chart-legend"><span><i class="reference"></i>${escapeHtml(referenceName)}</span><span><i class="comparison"></i>${escapeHtml(comparisonName)}</span>${includeIdeal ? "<span><i class=\"ideal\"></i>Ideal calibration</span>" : ""}</div>`;
}

function legend(items, colors) {
  return `<div class="chart-legend">${items.map((item, index) => `<span><i style="background:${colors[index % colors.length]}"></i>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function horizontalGroupedBars(rows, series, colors, { percent = false, minWidth = 560 } = {}) {
  const width = Math.max(minWidth, 660); const labelWidth = 170; const right = 22; const top = 24; const rowHeight = Math.max(44, series.length * 15 + 17); const height = top + rows.length * rowHeight + 42; const plotWidth = width - labelWidth - right;
  const marks = rows.map((row, rowIndex) => row.values.map((value, seriesIndex) => {
    if (value == null) return "";
    const y = top + rowIndex * rowHeight + seriesIndex * 14;
    const tooltip = row.tooltips?.[seriesIndex] ?? `${series[seriesIndex]}: ${percent ? formatPercent(value) : formatNumber(value)}`;
    return `<rect x="${labelWidth}" y="${y}" width="${Math.max(1, value * plotWidth)}" height="10" fill="${colors[seriesIndex % colors.length]}"><title>${escapeHtml(tooltip)}</title></rect>`;
  }).join("") + svgText(labelWidth - 8, top + rowIndex * rowHeight + 11, row.label, "chart-label", "end")).join("");
  const ticks = [0, .25, .5, .75, 1].map((value) => `<line x1="${labelWidth + value * plotWidth}" y1="${top - 8}" x2="${labelWidth + value * plotWidth}" y2="${height - 34}" class="chart-grid"/>${svgText(labelWidth + value * plotWidth, height - 14, formatPercent(value, 0))}`).join("");
  return `<svg class="audit-chart" style="min-width:${minWidth}px" viewBox="0 0 ${width} ${height}" role="img">${ticks}${marks}</svg>${legend(series, colors)}`;
}

function divergingBars(rows, series, colors) {
  const width = 680; const labelWidth = 170; const center = 430; const top = 24; const rowHeight = Math.max(44, series.length * 15 + 17); const height = top + rows.length * rowHeight + 42; const scale = 650;
  const marks = rows.map((row, rowIndex) => row.values.map((value, seriesIndex) => {
    if (value == null) return "";
    const x = value < 0 ? center + value * scale : center;
    const y = top + rowIndex * rowHeight + seriesIndex * 14;
    return `<rect x="${x}" y="${y}" width="${Math.max(1, Math.abs(value) * scale)}" height="10" fill="${colors[seriesIndex % colors.length]}"><title>${escapeHtml(series[seriesIndex])}: ${(value * 100).toFixed(1)} percentage points</title></rect>`;
  }).join("") + svgText(labelWidth - 8, top + rowIndex * rowHeight + 11, row.label, "chart-label", "end")).join("");
  return `<svg class="audit-chart" viewBox="0 0 ${width} ${height}" role="img"><line x1="${center}" y1="8" x2="${center}" y2="${height - 30}" class="threshold-line"/>${svgText(center, height - 10, "0 pp (reference)")}${marks}</svg>${legend(series, colors)}`;
}

function lineCategoryChart(rows, series, colors) {
  const width = 920; const height = 330; const left = 72; const right = 25; const top = 25; const bottom = 75; const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const grid = [0, .25, .5, .75, 1].map((value) => `<line x1="${left}" y1="${top + plotHeight - value * plotHeight}" x2="${width - right}" y2="${top + plotHeight - value * plotHeight}" class="chart-grid"/>${svgText(left - 8, top + plotHeight - value * plotHeight + 4, formatPercent(value, 0), "chart-label", "end")}`).join("");
  const lines = series.map((name, seriesIndex) => {
    const points = rows.map((row, index) => ({ x: left + index * plotWidth / Math.max(1, rows.length - 1), y: top + plotHeight - (row.values[seriesIndex] ?? 0) * plotHeight, value: row.values[seriesIndex] }));
    return `<polyline fill="none" stroke="${colors[seriesIndex % colors.length]}" stroke-width="3" points="${points.map((point) => `${point.x},${point.y}`).join(" ")}"/>${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4" fill="${colors[seriesIndex % colors.length]}"><title>${escapeHtml(name)}: ${formatPercent(point.value)}</title></circle>`).join("")}`;
  }).join("");
  const labels = rows.map((row, index) => svgText(left + index * plotWidth / Math.max(1, rows.length - 1), height - 38, row.label, "chart-label")).join("");
  return `<svg class="audit-chart" viewBox="0 0 ${width} ${height}" role="img">${grid}${lines}${labels}</svg>${legend(series, colors)}`;
}

function renderAgeAndThresholdCharts(reference, comparison, referenceName, comparisonName) {
  const ageGroups = ["0-4", "5-9", "10-14", "15-19", "20-29", "30-39"];
  const ageRows = ageGroups.map((age) => {
    const subset = cohort.filter((row) => row.age_group === age);
    const p = performance(subset, Number($("#threshold").value));
    const meanRisk = subset.length ? subset.reduce((sum, row) => sum + Number(row.predicted_risk_2y), 0) / subset.length : 0;
    return { label: age, values: [p.eventRate, meanRisk, p.selectionRate] };
  });
  $("#age-analysis-chart").innerHTML = lineCategoryChart(ageRows, ["Observed outcome", "Mean predicted risk", "Model-positive"], ["#102f2a", "#2e7d78", "#f46b45"]);
  const thresholds = Array.from({ length: 12 }, (_, index) => 0.05 + index * 0.05);
  const thresholdRows = thresholds.map((threshold) => {
    const audit = directionalFairness(reference, comparison, threshold);
    return { label: `${Math.round(threshold * 100)}%`, values: [audit.truePositiveRateDifference, audit.falseNegativeRateDifference, audit.statisticalParityDifference] };
  });
  $("#threshold-analysis-chart").innerHTML = signedLineChart(thresholdRows, ["Sensitivity gap", "False-negative gap", "Selection-rate gap"], ["#2e7d78", "#9e3b2d", "#f46b45"], referenceName, comparisonName);
  const agePerformances = ageGroups.map((age) => ({ age, metrics: performance(cohort.filter((row) => row.age_group === age), Number($("#threshold").value)) }));
  const orderedAges = [...agePerformances].sort((a, b) => (b.metrics.selectionRate ?? 0) - (a.metrics.selectionRate ?? 0));
  $("#age-explanation").innerHTML = `<b>What this means</b><p>Model-positive rates range from ${formatPercent(orderedAges.at(-1)?.metrics.selectionRate)} in ages ${escapeHtml(orderedAges.at(-1)?.age)} to ${formatPercent(orderedAges[0]?.metrics.selectionRate)} in ages ${escapeHtml(orderedAges[0]?.age)}. Differences may reflect disease mix, treatment, model behavior, or injected scenario effects.</p><b>Possible actions</b><p>Evaluate pediatric and AYA age bands separately, inspect calibration and outcomes within diagnosis, and avoid assuming that a model developed in one age range transports to another.</p>`;
  $("#threshold-analysis-explanation").innerHTML = `<b>What this means</b><p>Fairness is not a fixed property of a score. As the cutoff changes, the balance between detected outcomes, missed outcomes, and model-positive classifications changes for both populations.</p><b>Possible actions</b><p>Select thresholds using the intended clinical action and relative harms of false negatives and false positives. Predefine acceptable performance, examine confidence intervals, and document whether one threshold or population-specific recalibration is justified.</p>`;
}

function signedLineChart(rows, series, colors, referenceName, comparisonName) {
  const width = 780; const height = 330; const left = 58; const right = 20; const top = 25; const bottom = 55; const plotWidth = width - left - right; const plotHeight = height - top - bottom; const maxAbs = Math.max(.05, ...rows.flatMap((row) => row.values.map((value) => Math.abs(value || 0))));
  const y = (value) => top + plotHeight / 2 - (value / maxAbs) * plotHeight / 2;
  const marks = series.map((name, seriesIndex) => { const points = rows.map((row, index) => ({ x: left + index * plotWidth / (rows.length - 1), y: y(row.values[seriesIndex] || 0), value: row.values[seriesIndex] })); return `<polyline fill="none" stroke="${colors[seriesIndex]}" stroke-width="3" points="${points.map((point) => `${point.x},${point.y}`).join(" ")}"/>${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3" fill="${colors[seriesIndex]}"><title>${escapeHtml(name)}: ${(point.value * 100).toFixed(1)} pp</title></circle>`).join("")}`; }).join("");
  const labels = rows.map((row, index) => svgText(left + index * plotWidth / (rows.length - 1), height - 25, row.label)).join("");
  return `<svg class="audit-chart" viewBox="0 0 ${width} ${height}" role="img"><line x1="${left}" y1="${y(0)}" x2="${width - right}" y2="${y(0)}" class="threshold-line"/>${svgText(left - 8, y(maxAbs) + 4, `+${(maxAbs * 100).toFixed(0)} pp`, "chart-label", "end")}${svgText(left - 8, y(0) + 4, "0", "chart-label", "end")}${svgText(left - 8, y(-maxAbs) + 4, `-${(maxAbs * 100).toFixed(0)} pp`, "chart-label", "end")}${marks}${labels}</svg>${legend(series, colors)}<p class="formula">Direction: ${escapeHtml(comparisonName)} minus ${escapeHtml(referenceName)}.</p>`;
}

function renderModelCharts(reference, comparison, referenceName, comparisonName, threshold) {
  const width = 720; const height = 310;
  const left = 52; const right = 18; const top = 24; const bottom = 52;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const referenceBins = riskHistogram(reference, 20);
  const comparisonBins = riskHistogram(comparison, 20);
  const maxShare = Math.max(0.01, ...referenceBins.map((bin) => bin.share), ...comparisonBins.map((bin) => bin.share));
  const groupWidth = plotWidth / referenceBins.length;
  const bars = referenceBins.map((bin, index) => {
    const referenceHeight = bin.share / maxShare * plotHeight;
    const comparisonHeight = comparisonBins[index].share / maxShare * plotHeight;
    const x = left + index * groupWidth;
    return `<rect class="chart-bar reference" x="${x + 1}" y="${top + plotHeight - referenceHeight}" width="${Math.max(1, groupWidth / 2 - 2)}" height="${referenceHeight}"><title>${escapeHtml(referenceName)}: ${formatPercent(bin.share)} of scores from ${formatPercent(bin.lower, 0)} to ${formatPercent(bin.upper, 0)}</title></rect><rect class="chart-bar comparison" x="${x + groupWidth / 2}" y="${top + plotHeight - comparisonHeight}" width="${Math.max(1, groupWidth / 2 - 2)}" height="${comparisonHeight}"><title>${escapeHtml(comparisonName)}: ${formatPercent(comparisonBins[index].share)} of scores from ${formatPercent(bin.lower, 0)} to ${formatPercent(bin.upper, 0)}</title></rect>`;
  }).join("");
  const thresholdX = left + threshold * plotWidth;
  const xTicks = [0, .25, .5, .75, 1].map((value) => `${svgText(left + value * plotWidth, height - 25, formatPercent(value, 0))}<line x1="${left + value * plotWidth}" y1="${top + plotHeight}" x2="${left + value * plotWidth}" y2="${top + plotHeight + 5}" class="chart-axis"/>`).join("");
  $("#risk-histogram").innerHTML = `<svg class="audit-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Predicted risk distribution for ${escapeHtml(referenceName)} and ${escapeHtml(comparisonName)}"><line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" class="chart-axis"/>${bars}<line x1="${thresholdX}" y1="${top}" x2="${thresholdX}" y2="${top + plotHeight}" class="threshold-line"/>${svgText(Math.min(width - 75, thresholdX + 6), top + 12, `${formatPercent(threshold, 0)} threshold`, "threshold-label", "start")}${xTicks}${svgText(left + plotWidth / 2, height - 5, "Predicted two-year risk", "chart-axis-title")}</svg>${chartLegend(referenceName, comparisonName)}`;

  const calibration = [
    { name: referenceName, bins: calibrationBins(reference, 10), className: "reference" },
    { name: comparisonName, bins: calibrationBins(comparison, 10), className: "comparison" }
  ];
  const points = calibration.map((series) => {
    const valid = series.bins.filter((bin) => bin.n >= MIN_CELL_DEFAULT && bin.meanPredicted != null && bin.observedRate != null);
    const coordinates = valid.map((bin) => `${left + bin.meanPredicted * plotWidth},${top + plotHeight - bin.observedRate * plotHeight}`).join(" ");
    const circles = valid.map((bin) => `<circle class="chart-point ${series.className}" cx="${left + bin.meanPredicted * plotWidth}" cy="${top + plotHeight - bin.observedRate * plotHeight}" r="5"><title>${escapeHtml(series.name)}: predicted ${formatPercent(bin.meanPredicted)}, observed ${formatPercent(bin.observedRate)}, n=${bin.n.toLocaleString()}</title></circle>`).join("");
    return `${coordinates ? `<polyline class="chart-line ${series.className}" points="${coordinates}"/>` : ""}${circles}`;
  }).join("");
  const grid = [0, .25, .5, .75, 1].map((value) => `<line x1="${left}" y1="${top + plotHeight - value * plotHeight}" x2="${width - right}" y2="${top + plotHeight - value * plotHeight}" class="chart-grid"/>${svgText(left - 8, top + plotHeight - value * plotHeight + 4, formatPercent(value, 0), "chart-label", "end")}${svgText(left + value * plotWidth, height - 25, formatPercent(value, 0))}`).join("");
  $("#calibration-chart").innerHTML = `<svg class="audit-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Observed versus predicted risk calibration plot">${grid}<line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top}" class="ideal-line"/>${points}${svgText(left + plotWidth / 2, height - 5, "Mean predicted risk", "chart-axis-title")}${svgText(14, top + plotHeight / 2, "Observed outcome rate", "chart-axis-title vertical")}</svg>${chartLegend(referenceName, comparisonName, true)}`;
  const referencePerformance = performance(reference, threshold); const comparisonPerformance = performance(comparison, threshold);
  $("#risk-explanation").innerHTML = `<b>What this means</b><p>The distributions show whether ${escapeHtml(referenceName)} and ${escapeHtml(comparisonName)} receive systematically different predicted risks. At ${formatPercent(threshold, 0)}, ${formatPercent(referencePerformance.selectionRate)} and ${formatPercent(comparisonPerformance.selectionRate)}, respectively, are model-positive.</p><b>Possible actions</b><p>Inspect whether distribution shifts remain within cancer type, stage, and treatment strata; review influential predictors; and evaluate the consequences of changing the threshold before deployment.</p>`;
  $("#calibration-explanation").innerHTML = `<b>What this means</b><p>Calibration asks whether a predicted probability corresponds to the observed synthetic outcome frequency. Overall observed-to-expected ratios are ${formatNumber(referencePerformance.calibrationRatio)} for ${escapeHtml(referenceName)} and ${formatNumber(comparisonPerformance.calibrationRatio)} for ${escapeHtml(comparisonName)}.</p><b>Possible actions</b><p>Recalibrate only after checking outcome definitions, follow-up, censoring, and dataset shift. Validate recalibration externally and ensure that improvement is not confined to the largest group.</p>`;
}

function renderIntegration() {
  const result = validateRows(cohort);
  $("#validation-results").innerHTML = cohort.length
    ? `<p class="${result.valid ? "ok" : "error"}">${result.valid ? "Canonical validation passed." : "Canonical validation failed."}</p>${[...result.errors, ...result.warnings].map((message) => `<p>• ${escapeHtml(message)}</p>`).join("")}<p>${REQUIRED_FIELDS.length} required fields checked across ${cohort.length.toLocaleString()} records.</p>`
    : "<p>No cohort loaded.</p>";
  $("#download-ccdi-bundle").disabled = !cohort.length;
  $("#download-audit-report").disabled = !cohort.length;
}

function renderExecutiveSummary() {
  if (!cohort.length) return;
  const threshold = Number($("#threshold").value);
  const readinessField = currentGroupField("readiness");
  const groups = groupCounts(cohort, readinessField).filter((row) => row.group !== "Missing");
  const care = careRates(cohort, currentGroupField("care")).filter((row) => !row.suppressed && row.rate != null);
  const reference = groups[0]?.group;
  const referenceCare = new Map(care.filter((row) => row.group === reference).map((row) => [row.measure, row.rate]));
  const gaps = care.filter((row) => row.group !== reference).map((row) => ({ ...row, gap: row.rate - (referenceCare.get(row.measure) ?? row.rate) })).sort((a, b) => a.gap - b.gap);
  const worst = gaps[0];
  const overall = performance(cohort, threshold);
  const scenario = SCENARIOS[$("#scenario").value];
  $("#executive-summary").innerHTML = `<div class="eyebrow">Cancer challenge executive summary</div><h3>What this demonstration contributes to the CCDI Data Ecosystem</h3><p><b>Objective.</b> Provide a shovel-ready, privacy-first analytical toolkit that detects data-readiness problems, eligibility-conditioned care gaps, and prediction-performance heterogeneity before models or datasets are reused.</p><div class="summary-grid"><div><span>Demonstration cohort</span><b>${cohort.length.toLocaleString()} simulated childhood/AYA records</b><small>Ages 0-39; no CCDI participant data</small></div><div><span>Scenario</span><b>${escapeHtml(scenario.label)}</b><small>Known synthetic ground truth</small></div><div><span>Active score</span><b>Synthetic 2-year adverse outcome</b><small>AUC ${formatNumber(overall.auc)}; not clinically validated</small></div><div><span>Decision setting</span><b>${formatPercent(threshold, 0)} exploratory threshold</b><small>${formatPercent(overall.selectionRate)} of records model-positive</small></div></div><p><b>Leading review signal.</b> ${worst ? `${escapeHtml(worst.group)} shows ${Math.abs(worst.gap * 100).toFixed(1)} percentage points ${worst.gap < 0 ? "lower" : "higher"} ${escapeHtml(worst.measure.toLowerCase())} than ${escapeHtml(reference)}.` : "No reportable care comparison is available."} This is a simulated signal for software evaluation—not a causal finding or estimate of real-world inequity.</p><p><b>Challenge relevance.</b> The browser-only tool produces reusable aggregate audits, supports configurable synthetic preliminary data, and defines an adapter boundary for later testing with authorized CCDI-compatible data. Next validation steps are model-specific adapters, CCDI terminology mapping, and evaluation with approved data and collaborators.</p>`;
}

function currentAuditReport() {
  return buildAuditReport(cohort, {
    source,
    readinessField: currentGroupField("readiness"),
    careField: currentGroupField("care"),
    fairnessField: currentGroupField("fairness"),
    referenceGroup: $("#reference-group").value,
    comparisonGroup: $("#comparison-group").value,
    threshold: Number($("#threshold").value)
  });
}

function table(headers, rows, className = () => "") {
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr class="${className(row)}">${row.map((cell, index) => `<td class="${index >= 2 ? "numeric" : ""}">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function renderAll() {
  renderStatus();
  refreshTable1Groups();
  renderTable1();
  renderExecutiveSummary();
  renderReadiness();
  renderCare();
  refreshFairnessGroups();
  renderFairness();
  renderIntegration();
}

function createSynthetic(announce = true) {
  cohort = generateCohort({
    size: Number($("#cohort-size").value),
    seed: Number($("#seed").value),
    scenario: $("#scenario").value
  });
  source = "Synthetic";
  renderAll();
  if (announce) {
    const message = $("#generation-message");
    message.innerHTML = `<b>Cohort generated.</b> ${cohort.length.toLocaleString()} synthetic records created using the ${escapeHtml(SCENARIOS[$("#scenario").value].label)} scenario and seed ${escapeHtml($("#seed").value)}. Table 1 and all analyses have been refreshed.`;
    message.classList.add("show");
    window.setTimeout(() => message.classList.remove("show"), 6500);
    window.setTimeout(() => $(".table-one-card").scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }
}

for (const [key, scenario] of Object.entries(SCENARIOS)) {
  $("#scenario").insertAdjacentHTML("beforeend", `<option value="${key}">${scenario.label}</option>`);
}
$("#scenario").value = "access_gap";
updateScenarioDescription();
$("#scenario").addEventListener("change", updateScenarioDescription);
$("#generate").addEventListener("click", () => createSynthetic(true));
$("#download-csv").addEventListener("click", () => download("cancer-equity-compass-synthetic.csv", toCsv(cohort), "text/csv"));
$("#download-json").addEventListener("click", () => download("cancer-equity-compass-synthetic.json", JSON.stringify(cohort, null, 2), "application/json"));
$("#download-ccdi-bundle").addEventListener("click", () => download("cancer-equity-compass-ccdi-demonstration-bundle.json", JSON.stringify(toCcdiDemonstrationBundle(cohort), null, 2), "application/json"));
$("#download-audit-report").addEventListener("click", () => download("cancer-equity-compass-aggregate-audit-report.json", JSON.stringify(currentAuditReport(), null, 2), "application/json"));
$("#file-upload").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = parseCsv(await file.text());
    const validation = validateRows(parsed);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    cohort = parsed;
    source = "Uploaded CSV";
    renderAll();
  } catch (error) {
    alert(`The CSV could not be loaded: ${error.message}`);
  }
});
$$('.group-field').forEach((select) => select.addEventListener("change", () => select.closest(".tab-panel").id === "care" ? renderCare() : renderReadiness()));
function renderFairnessInView() {
  renderFairness();
  window.requestAnimationFrame(() => $(".live-fairness-card").scrollIntoView({ behavior: "smooth", block: "nearest" }));
}
$("#fairness-field").addEventListener("change", () => { refreshFairnessGroups(); renderFairnessInView(); });
$("#reference-group").addEventListener("change", renderFairnessInView);
$("#comparison-group").addEventListener("change", renderFairnessInView);
$("#threshold").addEventListener("input", renderFairnessInView);
$("#table1-field").addEventListener("change", () => { refreshTable1Groups(); renderTable1(); });
$("#table1-reference").addEventListener("change", renderTable1);
$("#table1-comparison").addEventListener("change", renderTable1);
$$('.tab').forEach((button) => button.addEventListener("click", () => {
  $$('.tab').forEach((tab) => tab.classList.toggle("active", tab === button));
  $$('.tab-panel').forEach((panel) => panel.classList.toggle("active", panel.id === button.dataset.tab));
}));
$$('[data-scroll]').forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.scroll).scrollIntoView()));

createSynthetic(false);
