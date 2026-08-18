import { generateCohort, SCENARIOS } from "./synthetic.js?v=20260818-3";
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
  renderMissingnessHeatmap(missingness, missingFields);
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
  $("#missingness-table").innerHTML = `<div class="heatmap" style="grid-template-columns:minmax(150px,1.25fr) repeat(${fields.length},minmax(82px,1fr))">${header}${body}</div><div class="heatmap-legend"><span>0% missing</span><i></i><span>${formatPercent(maxRate)} or higher</span></div>`;
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
  renderExecutiveSummary();
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
