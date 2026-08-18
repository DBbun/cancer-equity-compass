# Canonical data contract

The Auditor accepts one row per participant for the initial demonstration workflow. Longitudinal and multi-table CCDI adapters are planned as a later integration layer.

## Required fields

| Field | Type | Meaning |
|---|---|---|
| `participant_id` | string | Synthetic or source-local pseudonymous identifier |
| `age_at_diagnosis` | number | Age in years, 0-39 |
| `age_group` | category | `0-4`, `5-9`, `10-14`, `15-19`, `20-29`, or `30-39` |
| `sex` | category | Demonstration categories: `Female`, `Male` |
| `race_ethnicity` | category | Demonstration analytic grouping |
| `cancer_type` | category | Childhood/AYA cancer grouping |
| `risk_group` | category | `Standard`, `Intermediate`, or `High` |
| `site` | category | Contributing site label |
| `predicted_risk_2y` | number | Predicted probability from 0 to 1 |
| `outcome_2y` | binary | Observed two-year adverse outcome |

## Care-process fields

`molecular_test_eligible`, `molecular_test_completed`, `treatment_eligible`, `treatment_received`, `treatment_adherent`, `followup_complete`, `psychosocial_screen_eligible`, `psychosocial_screen_completed`, `survivorship_plan_eligible`, `survivorship_plan_completed`, and `adverse_event` are binary indicators. Care-gap denominators use the relevant eligibility field rather than the entire population.

The fertility pathway uses separate indicators for risk-assessment eligibility,
risk assessment, preservation eligibility, discussion, and completion. This
prevents the tool from interpreting non-completion as a gap when preservation was
not clinically indicated or not discussed.

`care_model`, `cost_barrier`, `transition_readiness`, `recommendations_given`,
`recommendations_recalled`, and `recommendations_completed` support synthetic
tests of survivorship engagement and recommendation completion.

## Treatment-exposure fields

`anthracycline_dose_band`, `alkylating_agent_dose_band`, `chest_radiation`,
`cranial_neck_radiation`, `abdominal_pelvic_radiation`, and
`hematopoietic_stem_cell_transplant` provide an initial bridge to published
late-effects risk models. Current values are synthetic engineering constructs;
they are not reconstructed treatment histories or validated dose estimates.

## Disease-specific classification fields

`diagnosis_classification_system`, `disease_stage`, and `tumor_histology` retain
the context needed to interpret a risk group. Neuroblastoma demonstration records
add INRGSS stage, image-defined risk factors, MYCN amplification, ploidy, and
segmental chromosomal aberrations. Wilms tumor demonstration records add stage,
histology, combined 1p/16q loss of heterozygosity, and 1q gain.

These are synthetic approximations of the published classification structure.
They are not executable COG, SIOP, or INRG treatment assignments.

## Demonstration CCDI node bundle

The browser can transform canonical rows into a JSON bundle containing `study`,
`participant`, `diagnosis`, `treatment`, and `survival` arrays. These mirror node
boundaries identified in the public CCDI Submission Guide. Property names and
value sets remain a DBbun demonstration mapping until validated against a
specific CCDI Data Model and Metadata Submission Template version.

## Time-to-event fields

`time_to_event_months` is the observed time up to 24 months and `event_observed` indicates whether the modeled event occurred before censoring.

## Missingness

Blank CSV values and JSON `null` values are treated as missing. The tool reports subgroup missingness and suppresses unstable cells below the configured minimum size.

## Current integration status

This is a DBbun canonical demonstration contract informed by public CCDI descriptions. It is not yet an official CCDI data model. Milestone work would add versioned mappings, provenance, multi-table relationships, controlled terminology, and validation against the CCDI Submission Guide and GitHub requirements in collaboration with NCI/CCDI.
