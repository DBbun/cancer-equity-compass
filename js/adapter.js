export const REQUIRED_FIELDS = [
  "participant_id",
  "age_at_diagnosis",
  "years_since_diagnosis",
  "cost_barrier",
  "transition_readiness",
  "image_defined_risk_factor",
  "mycn_amplified",
  "segmental_chromosomal_aberration",
  "wilms_loh_1p_16q",
  "wilms_1q_gain",
  "chest_radiation",
  "cranial_neck_radiation",
  "abdominal_pelvic_radiation",
  "hematopoietic_stem_cell_transplant",
  "age_group",
  "sex",
  "race_ethnicity",
  "cancer_type",
  "risk_group",
  "site",
  "predicted_risk_2y",
  "outcome_2y"
];

export const NUMERIC_FIELDS = new Set([
  "age_at_diagnosis",
  "molecular_test_eligible",
  "molecular_test_completed",
  "treatment_eligible",
  "treatment_received",
  "treatment_adherent",
  "followup_complete",
  "psychosocial_screen_eligible",
  "psychosocial_screen_completed",
  "survivorship_plan_eligible",
  "survivorship_plan_completed",
  "fertility_risk_assessment_eligible",
  "fertility_risk_assessed",
  "fertility_preservation_eligible",
  "fertility_preservation_discussed",
  "fertility_preservation_completed",
  "recommendations_given",
  "recommendations_recalled",
  "recommendations_completed",
  "adverse_event",
  "predicted_risk_2y",
  "outcome_2y",
  "time_to_event_months",
  "event_observed"
]);

export function toCcdiDemonstrationBundle(rows, { studyId = "SYN-COMPASS-2026" } = {}) {
  return {
    metadata: {
      adapter: "DBbun CCDI demonstration adapter",
      adapter_version: "0.2.0",
      status: "Not an official CCDI submission package",
      generated_from: "Cancer Equity Compass canonical participant records"
    },
    study: [{ study_id: studyId, study_name: "Synthetic Cancer Equity Compass Demonstration", data_access: "Open synthetic data" }],
    participant: rows.map((row) => ({
      participant_id: row.participant_id,
      study_id: studyId,
      sex: row.sex,
      race_ethnicity: row.race_ethnicity,
      primary_language: row.primary_language
    })),
    diagnosis: rows.map((row) => ({
      diagnosis_id: `${row.participant_id}-DX1`,
      participant_id: row.participant_id,
      age_at_diagnosis: row.age_at_diagnosis,
      cancer_type: row.cancer_type,
      classification_system: row.diagnosis_classification_system,
      disease_stage: row.disease_stage,
      tumor_histology: row.tumor_histology,
      risk_group: row.risk_group
    })),
    treatment: rows.map((row) => ({
      treatment_id: `${row.participant_id}-TX1`,
      participant_id: row.participant_id,
      treatment_received: row.treatment_received,
      anthracycline_dose_band: row.anthracycline_dose_band,
      alkylating_agent_dose_band: row.alkylating_agent_dose_band,
      chest_radiation: row.chest_radiation,
      cranial_neck_radiation: row.cranial_neck_radiation,
      abdominal_pelvic_radiation: row.abdominal_pelvic_radiation,
      hematopoietic_stem_cell_transplant: row.hematopoietic_stem_cell_transplant
    })),
    survival: rows.map((row) => ({
      survival_id: `${row.participant_id}-SV1`,
      participant_id: row.participant_id,
      time_to_event_months: row.time_to_event_months,
      event_observed: row.event_observed,
      outcome_2y: row.outcome_2y
    }))
  };
}

export function parseCsv(text) {
  const rows = [];
  let row = []; let field = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) throw new Error("CSV must contain a header and at least one data row.");
  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => {
    const raw = (values[index] ?? "").trim();
    if (raw === "") return [header, null];
    return [header, NUMERIC_FIELDS.has(header) ? Number(raw) : raw];
  })));
}

export function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    if (value == null) return "";
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

export function validateRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return { valid: false, errors: ["No records were provided."], warnings: [] };
  const columns = new Set(Object.keys(rows[0]));
  const errors = REQUIRED_FIELDS.filter((field) => !columns.has(field)).map((field) => `Missing required field: ${field}`);
  const warnings = [];
  const duplicateIds = rows.length - new Set(rows.map((row) => row.participant_id)).size;
  if (duplicateIds) warnings.push(`${duplicateIds} duplicate participant identifiers detected.`);
  const invalidAge = rows.filter((row) => !Number.isFinite(Number(row.age_at_diagnosis)) || Number(row.age_at_diagnosis) < 0 || Number(row.age_at_diagnosis) > 39).length;
  if (invalidAge) errors.push(`${invalidAge} records have age_at_diagnosis outside 0-39 or non-numeric.`);
  const invalidRisk = rows.filter((row) => !Number.isFinite(Number(row.predicted_risk_2y)) || Number(row.predicted_risk_2y) < 0 || Number(row.predicted_risk_2y) > 1).length;
  if (invalidRisk) errors.push(`${invalidRisk} records have predicted_risk_2y outside 0-1 or non-numeric.`);
  const invalidOutcome = rows.filter((row) => ![0, 1].includes(Number(row.outcome_2y))).length;
  if (invalidOutcome) errors.push(`${invalidOutcome} records have outcome_2y values other than 0 or 1.`);
  return { valid: errors.length === 0, errors, warnings };
}
