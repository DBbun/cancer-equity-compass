import {
  MIN_GROUP_SIZE_DEFAULT,
  careRates,
  directionalFairness,
  groupCounts,
  groupPerformance,
  missingnessByGroup,
  performance
} from "./metrics.js";
import { REQUIRED_FIELDS, validateRows } from "./adapter.js";

const DEFAULT_MISSINGNESS_FIELDS = [
  "race_ethnicity",
  "molecular_test_completed",
  "treatment_adherent",
  "followup_complete",
  "psychosocial_screen_completed",
  "survivorship_plan_completed"
];

function groupRows(rows, field, value) {
  return rows.filter((row) => String(row[field] ?? "Missing") === value);
}

function withoutSuppressedMetrics(row) {
  return row.suppressed ? { ...row, metrics: null } : row;
}

export function buildAuditReport(rows, options = {}) {
  const {
    source = "Unspecified",
    readinessField = "race_ethnicity",
    careField = readinessField,
    fairnessField = readinessField,
    referenceGroup = "",
    comparisonGroup = "",
    threshold = 0.2,
    minGroupSize = MIN_GROUP_SIZE_DEFAULT,
    generatedAt = new Date().toISOString()
  } = options;
  const validation = validateRows(rows);
  const availableGroups = groupCounts(rows, fairnessField)
    .filter((row) => row.group !== "Missing" && row.count >= minGroupSize);
  const reference = referenceGroup || availableGroups[0]?.group || "";
  const comparison = comparisonGroup || availableGroups[1]?.group || reference;
  const referenceRows = groupRows(rows, fairnessField, reference);
  const comparisonRows = groupRows(rows, fairnessField, comparison);

  return {
    report: {
      title: "Sub-population Fairness & Readiness Auditor for CCDI aggregate audit report",
      specificationVersion: "0.1.0",
      generatedAt,
      disclosureControl: {
        participantLevelRowsIncluded: false,
        minimumReportedGroupSize: minGroupSize,
        note: "Suppressed subgroup results do not include rates or model-performance metrics."
      }
    },
    dataset: {
      source,
      participants: rows.length,
      canonicalValidationPassed: validation.valid,
      validationErrorCount: validation.errors.length,
      validationWarningCount: validation.warnings.length,
      requiredFieldsChecked: REQUIRED_FIELDS.length
    },
    configuration: {
      readinessField,
      careField,
      fairnessField,
      referenceGroup: reference,
      comparisonGroup: comparison,
      riskThreshold: threshold
    },
    readiness: {
      representation: groupCounts(rows, readinessField),
      missingness: missingnessByGroup(rows, readinessField, DEFAULT_MISSINGNESS_FIELDS)
        .map((row) => row.n < minGroupSize ? { ...row, missing: null, rate: null, suppressed: true } : { ...row, suppressed: false })
    },
    care: careRates(rows, careField, minGroupSize),
    model: {
      overall: performance(rows, threshold),
      byPopulation: groupPerformance(rows, fairnessField, threshold, minGroupSize)
        .map(withoutSuppressedMetrics),
      directionalFairness: reference && comparison
        ? directionalFairness(referenceRows, comparisonRows, threshold)
        : null
    },
    interpretation: [
      "Results are audit signals and do not establish causality, discrimination, or unequal care.",
      "Synthetic results do not describe real CCDI participants or real-world disparities.",
      "Clinical need, disease biology, data provenance, uncertainty, and sample size must inform interpretation."
    ]
  };
}

export const __test__ = { DEFAULT_MISSINGNESS_FIELDS };
