const CANCERS = [
  ["Leukemia", 0.28],
  ["CNS tumor", 0.18],
  ["Lymphoma", 0.14],
  ["Sarcoma", 0.13],
  ["Neuroblastoma", 0.08],
  ["Renal tumor", 0.06],
  ["Germ cell tumor", 0.07],
  ["Other rare cancer", 0.06]
];

const RACES = [
  ["White, non-Hispanic", 0.50],
  ["Hispanic", 0.22],
  ["Black, non-Hispanic", 0.14],
  ["Asian", 0.08],
  ["Other or multiple", 0.06]
];

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random) {
  const u = Math.max(random(), 1e-12);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function logistic(value) {
  return 1 / (1 + Math.exp(-value));
}

function clamp(value, low = 0, high = 1) {
  return Math.min(high, Math.max(low, value));
}

function sampleWeighted(random, entries) {
  const draw = random();
  let cumulative = 0;
  for (const [label, weight] of entries) {
    cumulative += weight;
    if (draw <= cumulative) return label;
  }
  return entries.at(-1)[0];
}

function ageGroup(age) {
  if (age < 5) return "0-4";
  if (age < 10) return "5-9";
  if (age < 15) return "10-14";
  if (age < 20) return "15-19";
  if (age < 30) return "20-29";
  return "30-39";
}

function bernoulli(random, probability) {
  return random() < clamp(probability) ? 1 : 0;
}

function doseBand(random, probability) {
  if (random() >= probability) return "None";
  const draw = random();
  if (draw < 0.45) return "Low";
  if (draw < 0.80) return "Moderate";
  return "High";
}

function scenarioEffects(name, row) {
  const marginalized = ["Black, non-Hispanic", "Hispanic"].includes(row.race_ethnicity);
  const aya = row.age_at_diagnosis >= 15;
  const femaleAya = row.sex === "Female" && aya;
  const effects = {
    testing: 0,
    treatment: 0,
    adherence: 0,
    followup: 0,
    psychosocial: 0,
    survivorshipPlan: 0,
    fertility: 0,
    missingness: 0,
    modelShift: 0,
    outcome: 0
  };

  if (name === "access_gap" && marginalized) {
    effects.testing -= 0.20;
    effects.treatment -= 0.12;
    effects.followup -= 0.16;
  }
  if (name === "missingness_gap" && marginalized) effects.missingness += 0.22;
  if (name === "miscalibration" && row.sex === "Female") effects.modelShift -= 0.35;
  if (name === "intersectional" && femaleAya) {
    effects.adherence -= 0.25;
    effects.followup -= 0.22;
    effects.modelShift -= 0.12;
    effects.outcome += 0.10;
  }
  if (name === "survivorship_gap" && aya) {
    effects.followup -= 0.14;
    effects.psychosocial -= 0.18;
    effects.survivorshipPlan -= 0.20;
    effects.fertility -= 0.16;
  }
  if (name === "site_variation" && row.site === "Synthetic Site E") {
    effects.testing -= 0.14;
    effects.psychosocial -= 0.22;
    effects.survivorshipPlan -= 0.18;
    effects.missingness += 0.12;
  }
  return effects;
}

export const SCENARIOS = {
  balanced: {
    label: "Balanced benchmark",
    description: "Creates a benchmark cohort with shared data-completeness, care-process, outcome, and prediction mechanisms across populations. Small observed differences can still occur through sampling variation, making this the negative-control scenario for the auditors."
  },
  access_gap: {
    label: "Testing and treatment access gap",
    description: "Reduces the simulated probability of molecular testing, indicated treatment receipt, and follow-up completion for Black and Hispanic participants. Disease and eligibility logic remain active, allowing the Care-Gap Analyzer to test whether conditional process differences are detected."
  },
  missingness_gap: {
    label: "Differential missingness",
    description: "Increases missing values in selected care-process fields for Black and Hispanic participants without treating missingness as a clinical outcome. This tests whether the Data Readiness Auditor detects population-specific information loss before fairness results are interpreted."
  },
  miscalibration: {
    label: "Subgroup miscalibration",
    description: "Keeps the simulated outcome mechanism unchanged while shifting predicted risk downward for female participants. This creates subgroup underprediction and tests whether calibration and threshold metrics reveal a problem that overall discrimination can conceal."
  },
  intersectional: {
    label: "AYA intersectional care gap",
    description: "Combines lower adherence and follow-up, a higher simulated adverse-outcome probability, and prediction-score underestimation among female participants diagnosed at ages 15–39. This stress-tests intersectional analysis across age and sex."
  },
  survivorship_gap: {
    label: "AYA survivorship continuity gap",
    description: "Reduces follow-up completion, psychosocial screening, survivorship care planning, and fertility-pathway completion for participants diagnosed at ages 15–39. This represents a synthetic transition and survivorship-continuity problem, not an estimate of real AYA care."
  },
  site_variation: {
    label: "Site readiness and care variation",
    description: "Concentrates greater missingness and lower completion of selected care processes at Synthetic Site E. This tests whether a multi-site readiness review can distinguish a contributing-site data-quality signal from patient-population differences."
  }
};

export function generateCohort({ size = 10000, seed = 2026, scenario = "access_gap" } = {}) {
  const random = mulberry32(Number(seed) || 2026);
  const rows = [];
  for (let index = 0; index < size; index += 1) {
    const age = Math.min(39, Math.floor(Math.pow(random(), 0.72) * 40));
    const cancer = sampleWeighted(random, CANCERS);
    const sex = random() < 0.49 ? "Female" : "Male";
    const race = sampleWeighted(random, RACES);
    const highRiskProbability = cancer === "Neuroblastoma" || cancer === "Sarcoma" ? 0.34 : 0.19;
    const riskDraw = random();
    let riskGroup = riskDraw < highRiskProbability
      ? "High"
      : riskDraw < highRiskProbability + 0.31
        ? "Intermediate"
        : "Standard";
    const row = {
      participant_id: `SYN-${String(index + 1).padStart(6, "0")}`,
      age_at_diagnosis: age,
      age_group: ageGroup(age),
      age_sex: `${ageGroup(age)} · ${sex}`,
      sex,
      race_ethnicity: race,
      cancer_type: cancer,
      risk_group: riskGroup,
      site: `Synthetic Site ${String.fromCharCode(65 + Math.floor(random() * 5))}`
    };
    row.diagnosis_classification_system = "Synthetic general oncology grouping";
    row.disease_stage = sampleWeighted(random, [["Localized", 0.54], ["Regional", 0.27], ["Metastatic", 0.19]]);
    row.tumor_histology = "Not otherwise specified";
    row.image_defined_risk_factor = null;
    row.mycn_amplified = null;
    row.tumor_ploidy = null;
    row.segmental_chromosomal_aberration = null;
    row.wilms_loh_1p_16q = null;
    row.wilms_1q_gain = null;
    if (cancer === "Neuroblastoma") {
      row.diagnosis_classification_system = "INRGSS demonstration";
      const metastatic = random() < 0.47;
      const specialInfantPattern = metastatic && age < 2 && random() < 0.24;
      row.image_defined_risk_factor = bernoulli(random, 0.46);
      row.disease_stage = specialInfantPattern ? "MS" : metastatic ? "M" : row.image_defined_risk_factor ? "L2" : "L1";
      row.mycn_amplified = bernoulli(random, row.disease_stage === "M" ? 0.30 : 0.13);
      row.tumor_ploidy = sampleWeighted(random, [["Hyperdiploid", 0.55], ["Diploid", 0.35], ["Unknown", 0.10]]);
      row.segmental_chromosomal_aberration = bernoulli(random, 0.33);
      row.tumor_histology = random() < 0.68 ? "Favorable" : "Unfavorable";
      riskGroup = row.mycn_amplified || row.disease_stage === "M" || row.tumor_histology === "Unfavorable"
        ? "High"
        : row.disease_stage === "L2" || row.segmental_chromosomal_aberration ? "Intermediate" : "Standard";
      row.risk_group = riskGroup;
    }
    if (cancer === "Renal tumor") {
      row.diagnosis_classification_system = "Wilms tumor demonstration";
      row.disease_stage = sampleWeighted(random, [["I", 0.42], ["II", 0.22], ["III", 0.23], ["IV", 0.10], ["V", 0.03]]);
      row.tumor_histology = random() < 0.91 ? "Favorable/non-anaplastic" : "Diffuse or focal anaplasia";
      row.wilms_loh_1p_16q = bernoulli(random, 0.05);
      row.wilms_1q_gain = bernoulli(random, 0.24);
      riskGroup = row.disease_stage === "IV" || row.disease_stage === "V" || row.tumor_histology !== "Favorable/non-anaplastic" || row.wilms_loh_1p_16q
        ? "High"
        : row.disease_stage === "III" || row.wilms_1q_gain ? "Intermediate" : "Standard";
      row.risk_group = riskGroup;
    }
    row.years_since_diagnosis = Math.floor(random() * (age < 15 ? 21 : 16));
    row.care_model = sampleWeighted(random, [
      ["Specialized survivorship clinic", 0.18],
      ["General oncology clinic", 0.42],
      ["Primary care", 0.28],
      ["No recent survivorship care", 0.12]
    ]);
    row.primary_language = race === "Hispanic" && random() < 0.28 ? "Spanish" : "English";
    row.cost_barrier = bernoulli(random, race === "Hispanic" || race === "Black, non-Hispanic" ? 0.19 : 0.11);
    row.transition_readiness = clamp(0.70 - 0.18 * (age >= 15 && age < 25) - 0.12 * row.cost_barrier + normal(random) * 0.16);
    row.anthracycline_dose_band = doseBand(random, ["Leukemia", "Lymphoma", "Sarcoma"].includes(cancer) ? 0.72 : 0.30);
    row.alkylating_agent_dose_band = doseBand(random, ["Lymphoma", "Sarcoma", "Germ cell tumor"].includes(cancer) ? 0.66 : 0.28);
    row.chest_radiation = bernoulli(random, cancer === "Lymphoma" || cancer === "Sarcoma" ? 0.35 : 0.08);
    row.cranial_neck_radiation = bernoulli(random, cancer === "CNS tumor" ? 0.62 : 0.07);
    row.abdominal_pelvic_radiation = bernoulli(random, ["Renal tumor", "Germ cell tumor", "Sarcoma"].includes(cancer) ? 0.34 : 0.06);
    row.hematopoietic_stem_cell_transplant = bernoulli(random, riskGroup === "High" ? 0.18 : 0.025);
    const effects = scenarioEffects(scenario, row);
    const highRisk = riskGroup === "High" ? 1 : 0;
    const intermediateRisk = riskGroup === "Intermediate" ? 1 : 0;
    const aya = age >= 15 ? 1 : 0;
    row.molecular_test_eligible = cancer === "Other rare cancer" || cancer === "CNS tumor" || highRisk ? 1 : bernoulli(random, 0.55);
    row.molecular_test_completed = row.molecular_test_eligible
      ? bernoulli(random, 0.86 + effects.testing)
      : 0;
    row.treatment_eligible = 1;
    row.treatment_received = bernoulli(random, 0.94 + effects.treatment);
    row.treatment_adherent = row.treatment_received
      ? bernoulli(random, 0.88 - 0.05 * aya + effects.adherence)
      : 0;
    const careModelFollowup = row.care_model === "Specialized survivorship clinic" ? 0.10
      : row.care_model === "No recent survivorship care" ? -0.24 : 0;
    row.followup_complete = bernoulli(random, 0.83 - 0.07 * aya - 0.10 * row.cost_barrier + careModelFollowup + effects.followup);
    row.psychosocial_screen_eligible = 1;
    row.psychosocial_screen_completed = bernoulli(random, 0.78 - 0.05 * aya + effects.psychosocial);
    row.survivorship_plan_eligible = row.treatment_received;
    row.survivorship_plan_completed = row.survivorship_plan_eligible
      ? bernoulli(random, 0.74 - 0.08 * aya - 0.10 * row.cost_barrier + effects.survivorshipPlan)
      : 0;
    const gonadotoxicExposure = row.alkylating_agent_dose_band !== "None"
      || row.abdominal_pelvic_radiation
      || row.hematopoietic_stem_cell_transplant;
    row.fertility_risk_assessment_eligible = age >= 10 ? 1 : 0;
    row.fertility_risk_assessed = row.fertility_risk_assessment_eligible
      ? bernoulli(random, 0.84 + effects.fertility)
      : 0;
    row.fertility_preservation_eligible = row.fertility_risk_assessment_eligible && gonadotoxicExposure ? 1 : 0;
    row.fertility_preservation_discussed = row.fertility_preservation_eligible
      ? bernoulli(random, 0.76 - 0.08 * row.cost_barrier + effects.fertility)
      : 0;
    row.fertility_preservation_completed = row.fertility_preservation_discussed
      ? bernoulli(random, 0.58 - 0.12 * row.cost_barrier + effects.fertility)
      : 0;
    row.recommendations_given = Math.max(0, Math.min(12, Math.round(4 + 2 * highRisk + random() * 4)));
    row.recommendations_recalled = Math.min(row.recommendations_given, Math.round(row.recommendations_given * clamp(0.58 + 0.16 * row.transition_readiness + normal(random) * 0.14)));
    row.recommendations_completed = Math.min(row.recommendations_recalled, Math.round(row.recommendations_recalled * clamp(0.52 + 0.18 * row.transition_readiness - 0.18 * row.cost_barrier + normal(random) * 0.16)));
    const adverseProbability = 0.12 + 0.18 * highRisk + 0.07 * intermediateRisk + 0.06 * (1 - row.treatment_adherent);
    row.adverse_event = bernoulli(random, adverseProbability);

    const outcomeLogit = -3.0
      + 1.15 * highRisk
      + 0.52 * intermediateRisk
      + 0.32 * aya
      + 0.65 * (1 - row.treatment_received)
      + 0.52 * (1 - row.treatment_adherent)
      + 0.40 * (1 - row.followup_complete)
      + 0.36 * row.adverse_event
      + effects.outcome;
    const trueRisk = logistic(outcomeLogit);
    row.outcome_2y = bernoulli(random, trueRisk);
    row.predicted_risk_2y = clamp(logistic(
      outcomeLogit
      - 0.42 * (1 - row.followup_complete)
      + effects.modelShift
      + normal(random) * 0.42
    ), 0.005, 0.995);
    row.event_observed = row.outcome_2y;
    row.time_to_event_months = row.event_observed
      ? Math.max(0.5, Math.round((2 + random() * 21) * 10) / 10)
      : Math.max(4, Math.round((16 + random() * 8) * 10) / 10);

    if (effects.missingness && random() < effects.missingness) {
      const field = sampleWeighted(random, [
        ["molecular_test_completed", 0.35],
        ["treatment_adherent", 0.30],
        ["followup_complete", 0.20],
        ["psychosocial_screen_completed", 0.10],
        ["survivorship_plan_completed", 0.05]
      ]);
      row[field] = null;
    }
    rows.push(row);
  }
  return rows;
}

export const __test__ = { mulberry32, ageGroup, clamp };
