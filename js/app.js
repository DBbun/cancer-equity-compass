import { generateCohort, SCENARIOS } from "./synthetic.js?v=20260818-2";
import {
  MIN_CELL_DEFAULT,
  performance,
  directionalFairness,
  groupCounts,
  missingnessByGroup,
  careRates,
  groupPerformance,
  riskHistogram,
  calibrationBins
} from "./metrics.js";
import { parseCsv, toCsv, toCcdiDemonstrationBundle, validateRows, REQUIRED_FIELDS } from "./adapter.js";
import { buildAuditReport } from "./report.js";

let cohort = [];
let source = "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const formatPercent = (value, digits = 1) => value == null ? "—" : `${(value * 100).toFixed(digits)}%`;
const formatNumber = (value, digits = 2) => value == null || Number.isNaN(value) ? "—" : Number(value).toFixed(digits);
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
  const smallest = Math.min(...counts.filter((row) => row.group !== "Missing").map((row) => row.count));
  const invalid = validateRows(cohort);
  const overallMissing = missingness.reduce((sum, row) => sum + row.missing, 0) / Math.max(1, missingness.reduce((sum, row) => sum + row.n, 0));
  $("#readiness-kpis").innerHTML = [
    kpi("Participants", cohort.length.toLocaleString(), "Rows in the active cohort"),
    kpi("Population groups", String(counts.length), field.replaceAll("_", " ")),
    kpi("Smallest group", smallest.toLocaleString(), smallest < MIN_CELL_DEFAULT ? "Below default reporting threshold" : "Above default reporting threshold"),
    kpi("Selected-field missingness", formatPercent(overallMissing), invalid.valid ? "Canonical validation passed" : `${invalid.errors.length} validation issue(s)`)
  ].join("");
  $("#representation-chart").innerHTML = counts.map((row) => `<div class="bar-row"><span>${escapeHtml(row.group)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(1, row.share * 100)}%"></div></div><b>${formatPercent(row.share, 0)}</b></div>`).join("");
  $("#missingness-table").innerHTML = table(
    ["Population", "Field", "N", "Missing"],
    missingness.map((row) => [row.group, row.field.replaceAll("_", " "), row.n.toLocaleString(), formatPercent(row.rate)])
  );
}

function renderCare() {
  if (!cohort.length) return;
  const field = currentGroupField("care");
  const rows = careRates(cohort, field);
  $("#care-table").innerHTML = table(
    ["Population", "Care measure", "Eligible / observed", "Completed", "Rate"],
    rows.map((row) => [
      row.group,
      row.measure,
      row.denominator.toLocaleString(),
      row.numerator.toLocaleString(),
      row.suppressed ? "Suppressed" : formatPercent(row.rate)
    ]),
    (row) => row[4] === "Suppressed" ? "suppressed" : ""
  );
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
    ["Population", "N", "AUC", "O/E", "Sensitivity", "Specificity", "FNR", "Flagged"],
    groups.map((row) => row.suppressed
      ? [row.group, row.count.toLocaleString(), "Suppressed", "—", "—", "—", "—", "—"]
      : [row.group, row.count.toLocaleString(), formatNumber(row.metrics.auc), formatNumber(row.metrics.calibrationRatio), formatPercent(row.metrics.sensitivity), formatPercent(row.metrics.specificity), formatPercent(row.metrics.fnr), formatPercent(row.metrics.selectionRate)]),
    (row) => row[2] === "Suppressed" ? "suppressed" : ""
  );
}

function svgText(x, y, value, className = "chart-label", anchor = "middle") {
  return `<text x="${x}" y="${y}" class="${className}" text-anchor="${anchor}">${escapeHtml(value)}</text>`;
}

function chartLegend(referenceName, comparisonName, includeIdeal = false) {
  return `<div class="chart-legend"><span><i class="reference"></i>${escapeHtml(referenceName)}</span><span><i class="comparison"></i>${escapeHtml(comparisonName)}</span>${includeIdeal ? "<span><i class=\"ideal\"></i>Ideal calibration</span>" : ""}</div>`;
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
}

function renderIntegration() {
  const result = validateRows(cohort);
  $("#validation-results").innerHTML = cohort.length
    ? `<p class="${result.valid ? "ok" : "error"}">${result.valid ? "Canonical validation passed." : "Canonical validation failed."}</p>${[...result.errors, ...result.warnings].map((message) => `<p>• ${escapeHtml(message)}</p>`).join("")}<p>${REQUIRED_FIELDS.length} required fields checked across ${cohort.length.toLocaleString()} records.</p>`
    : "<p>No cohort loaded.</p>";
  $("#download-ccdi-bundle").disabled = !cohort.length;
  $("#download-audit-report").disabled = !cohort.length;
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
  renderReadiness();
  renderCare();
  refreshFairnessGroups();
  renderFairness();
  renderIntegration();
}

function createSynthetic() {
  cohort = generateCohort({
    size: Number($("#cohort-size").value),
    seed: Number($("#seed").value),
    scenario: $("#scenario").value
  });
  source = "Synthetic";
  renderAll();
}

for (const [key, scenario] of Object.entries(SCENARIOS)) {
  $("#scenario").insertAdjacentHTML("beforeend", `<option value="${key}">${scenario.label}</option>`);
}
$("#scenario").value = "access_gap";
updateScenarioDescription();
$("#scenario").addEventListener("change", updateScenarioDescription);
$("#generate").addEventListener("click", createSynthetic);
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
$("#fairness-field").addEventListener("change", () => { refreshFairnessGroups(); renderFairness(); });
$("#reference-group").addEventListener("change", renderFairness);
$("#comparison-group").addEventListener("change", renderFairness);
$("#threshold").addEventListener("input", renderFairness);
$$('.tab').forEach((button) => button.addEventListener("click", () => {
  $$('.tab').forEach((tab) => tab.classList.toggle("active", tab === button));
  $$('.tab-panel').forEach((panel) => panel.classList.toggle("active", panel.id === button.dataset.tab));
}));
$$('[data-scroll]').forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.scroll).scrollIntoView()));

createSynthetic();
