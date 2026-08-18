import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/synthetic.js";
import { performance, directionalFairness, groupCounts, careRates, riskHistogram, calibrationBins, wilsonInterval, welchTTest, mannWhitneyTest, chiSquareTest } from "../js/metrics.js";
import { parseCsv, toCsv, toCcdiDemonstrationBundle, validateRows } from "../js/adapter.js";
import { buildAuditReport } from "../js/report.js";

test("synthetic generation is deterministic and schema-valid", () => {
  const first = generateCohort({ size: 200, seed: 42, scenario: "balanced" });
  const second = generateCohort({ size: 200, seed: 42, scenario: "balanced" });
  assert.deepEqual(first, second);
  assert.equal(validateRows(first).valid, true);
  assert.ok(first.every((row) => row.recommendations_completed <= row.recommendations_recalled));
  assert.ok(first.every((row) => row.recommendations_recalled <= row.recommendations_given));
  assert.ok(first.every((row) => row.transition_readiness >= 0 && row.transition_readiness <= 1));
  assert.ok(first.every((row) => row.age_sex === `${row.age_group} · ${row.sex}`));
});

test("care-rate confidence intervals contain the observed proportion", () => {
  const [lower, upper] = wilsonInterval(80, 100);
  assert.ok(lower < 0.8 && upper > 0.8);
  const rows = generateCohort({ size: 2000, seed: 31, scenario: "balanced" });
  assert.ok(careRates(rows, "age_sex").filter((row) => !row.suppressed).every((row) => row.confidenceInterval[0] <= row.rate && row.rate <= row.confidenceInterval[1]));
});

test("balanced cohorts include realistic baseline documentation missingness", () => {
  const rows = generateCohort({ size: 10000, seed: 2026, scenario: "balanced" });
  for (const field of ["molecular_test_completed", "treatment_adherent", "followup_complete", "psychosocial_screen_completed", "survivorship_plan_completed"]) {
    const missing = rows.filter((row) => row[field] == null).length;
    assert.ok(missing > 0, `${field} should contain missing values`);
    assert.ok(missing / rows.length < 0.2, `${field} baseline missingness should remain bounded`);
  }
});

test("Table 1 statistical tests identify strong synthetic differences", () => {
  const first = Array.from({ length: 100 }, (_, index) => ({ value: index, category: index < 50 ? "A" : "B" }));
  const second = Array.from({ length: 100 }, (_, index) => ({ value: index + 100, category: index < 10 ? "A" : "B" }));
  assert.ok(welchTTest(first.map((row) => row.value), second.map((row) => row.value)).pValue < 0.001);
  assert.ok(mannWhitneyTest(first.map((row) => row.value), second.map((row) => row.value)).pValue < 0.001);
  assert.ok(chiSquareTest(first, second, "category").pValue < 0.001);
});

test("performance metrics stay within expected bounds", () => {
  const rows = generateCohort({ size: 2000, seed: 7, scenario: "miscalibration" });
  const metrics = performance(rows, 0.2);
  assert.ok(metrics.auc >= 0 && metrics.auc <= 1);
  assert.ok(metrics.brier >= 0 && metrics.brier <= 1);
  assert.ok(metrics.sensitivity >= 0 && metrics.sensitivity <= 1);
});

test("miscalibration scenario shifts female calibration ratio upward", () => {
  const rows = generateCohort({ size: 12000, seed: 2026, scenario: "miscalibration" });
  const female = rows.filter((row) => row.sex === "Female");
  const male = rows.filter((row) => row.sex === "Male");
  const audit = directionalFairness(male, female, 0.2);
  assert.ok(audit.calibrationRatioDifference > 0.1);
});

test("access-gap scenario lowers testing in selected populations", () => {
  const rows = generateCohort({ size: 15000, seed: 99, scenario: "access_gap" });
  const rates = careRates(rows, "race_ethnicity");
  const testRate = (group) => rates.find((row) => row.group === group && row.measure === "Molecular testing").rate;
  assert.ok(testRate("Black, non-Hispanic") < testRate("White, non-Hispanic"));
  assert.ok(groupCounts(rows, "race_ethnicity").length >= 5);
});

test("CSV round-trip preserves required values", () => {
  const rows = generateCohort({ size: 10, seed: 8, scenario: "balanced" });
  const parsed = parseCsv(toCsv(rows));
  assert.equal(parsed.length, rows.length);
  assert.equal(parsed[0].participant_id, rows[0].participant_id);
  assert.equal(parsed[0].outcome_2y, rows[0].outcome_2y);
  assert.equal(validateRows(parsed).valid, true);
});

test("AYA survivorship scenario lowers indicated continuity measures", () => {
  const rows = generateCohort({ size: 20000, seed: 314, scenario: "survivorship_gap" });
  const rates = careRates(rows, "age_group", 30);
  const rate = (group, measure) => rates.find((row) => row.group === group && row.measure === measure).rate;
  assert.ok(rate("20-29", "Psychosocial screening") < rate("5-9", "Psychosocial screening"));
  assert.ok(rate("30-39", "Survivorship care plan") < rate("5-9", "Survivorship care plan"));
});

test("site-variation scenario creates a detectable readiness signal", () => {
  const rows = generateCohort({ size: 20000, seed: 2718, scenario: "site_variation" });
  const rates = careRates(rows, "site", 30);
  const testRate = (site) => rates.find((row) => row.group === site && row.measure === "Molecular testing").rate;
  assert.ok(testRate("Synthetic Site E") < testRate("Synthetic Site A"));
  assert.ok(rows.some((row) => row.site === "Synthetic Site E" && row.followup_complete == null));
});

test("disease-specific fields respect neuroblastoma and Wilms eligibility", () => {
  const rows = generateCohort({ size: 10000, seed: 81, scenario: "balanced" });
  const neuroblastoma = rows.filter((row) => row.cancer_type === "Neuroblastoma");
  const wilms = rows.filter((row) => row.cancer_type === "Renal tumor");
  assert.ok(neuroblastoma.every((row) => ["L1", "L2", "M", "MS"].includes(row.disease_stage)));
  assert.ok(neuroblastoma.every((row) => [0, 1].includes(row.mycn_amplified)));
  assert.ok(wilms.every((row) => ["I", "II", "III", "IV", "V"].includes(row.disease_stage)));
  assert.ok(wilms.every((row) => [0, 1].includes(row.wilms_1q_gain)));
});

test("CCDI demonstration adapter preserves node relationships", () => {
  const rows = generateCohort({ size: 50, seed: 123, scenario: "balanced" });
  const bundle = toCcdiDemonstrationBundle(rows);
  assert.equal(bundle.participant.length, 50);
  assert.equal(bundle.diagnosis.length, 50);
  assert.equal(bundle.treatment.length, 50);
  assert.equal(bundle.survival.length, 50);
  assert.equal(bundle.diagnosis[0].participant_id, bundle.participant[0].participant_id);
  assert.match(bundle.metadata.status, /Not an official CCDI/);
});

test("fertility pathway preserves eligibility and process ordering", () => {
  const rows = generateCohort({ size: 10000, seed: 808, scenario: "survivorship_gap" });
  assert.ok(rows.every((row) => !row.fertility_preservation_completed || row.fertility_preservation_discussed));
  assert.ok(rows.every((row) => !row.fertility_preservation_discussed || row.fertility_preservation_eligible));
  assert.ok(rows.every((row) => !row.fertility_preservation_eligible || row.fertility_risk_assessment_eligible));
});

test("aggregate audit report excludes participant-level records", () => {
  const rows = generateCohort({ size: 2000, seed: 2026, scenario: "access_gap" });
  const report = buildAuditReport(rows, {
    source: "Synthetic",
    referenceGroup: "White, non-Hispanic",
    comparisonGroup: "Black, non-Hispanic",
    generatedAt: "2026-08-18T00:00:00.000Z"
  });
  const serialized = JSON.stringify(report);
  assert.equal(report.report.disclosureControl.participantLevelRowsIncluded, false);
  assert.equal(report.dataset.participants, rows.length);
  assert.equal(report.configuration.riskThreshold, 0.2);
  assert.ok(report.model.directionalFairness);
  assert.equal(serialized.includes("participant_id"), false);
  assert.equal(serialized.includes(rows[0].participant_id), false);
});

test("risk histogram and calibration bins preserve valid cohort totals", () => {
  const rows = generateCohort({ size: 2500, seed: 55, scenario: "miscalibration" });
  const histogram = riskHistogram(rows, 20);
  const calibration = calibrationBins(rows, 10);
  assert.equal(histogram.reduce((sum, bin) => sum + bin.count, 0), rows.length);
  assert.ok(Math.abs(histogram.reduce((sum, bin) => sum + bin.share, 0) - 1) < 1e-12);
  assert.equal(calibration.reduce((sum, bin) => sum + bin.n, 0), rows.length);
  assert.ok(calibration.filter((bin) => bin.n).every((bin) => bin.meanPredicted >= 0 && bin.meanPredicted <= 1));
  assert.ok(calibration.filter((bin) => bin.n).every((bin) => bin.observedRate >= 0 && bin.observedRate <= 1));
});
