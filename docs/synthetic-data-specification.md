# Synthetic data specification

## Purpose

The generator creates fully simulated childhood and AYA cancer records with a
known data-generating process. It is designed to test whether an analysis tool
can recover deliberately injected data-quality, care-process, and prediction-
model problems. It does not estimate the prevalence of real disparities.

## Generation order

1. Sample age, sex, race and ethnicity grouping, cancer grouping, and site.
2. Assign a synthetic clinical risk group and treatment-exposure profile
   conditional on cancer grouping.
   Neuroblastoma and Wilms tumor records first receive disease-specific stage,
   histology, and molecular-marker fields before the demonstration risk group is
   assigned.
3. Generate survivorship context, including years since diagnosis, care model,
   transition readiness, language, and a cost barrier.
4. Determine eligibility for molecular testing, treatment, psychosocial
   screening, and a survivorship care plan.
5. Generate care completion and recommendation recall/completion conditional on
   eligibility, age, risk, access, and the
   selected scenario.
6. Generate adverse events and a two-year outcome conditional on clinical risk
   and completed care processes.
7. Generate a noisy predicted probability, with optional subgroup
   miscalibration.
8. Apply scenario-specific missingness after the complete record exists.

This order separates clinical need, care received, outcome generation, model
behavior, and documentation quality. That separation is essential for testing
whether the Auditor uses correct denominators and identifies the intended signal.

## Current scenarios

| Scenario | Injected ground truth | Expected audit signal |
|---|---|---|
| Balanced benchmark | No population-specific intervention | Only sampling variation |
| Testing and treatment access gap | Lower testing, treatment, and follow-up for selected race and ethnicity groups | Care-rate differences conditional on eligibility |
| Differential missingness | Higher missingness in selected care fields | Subgroup missingness differences |
| Subgroup miscalibration | Downward-shifted predictions for one sex group | Observed-to-expected calibration difference |
| AYA intersectional care gap | Lower adherence and follow-up plus prediction shift for female AYA participants | Age-by-sex robustness signal |
| AYA survivorship continuity gap | Lower follow-up, psychosocial screening, and survivorship-plan completion at ages 15-39 | Age-group care-continuity differences |
| Site readiness and care variation | Missingness and lower selected completion rates at one synthetic site | Site readiness and care-process signal |

## Parameter policy

Current probabilities are engineering parameters chosen to create detectable
test cases. They are not published incidence or disparity estimates. Before any
parameter is described as clinically realistic, it must be supported by a cited
source, documented population, applicable age range, outcome definition, and
uncertainty statement.

## Baseline documentation missingness

All scenarios, including the balanced benchmark, contain nonzero documentation
missingness. The current engineering defaults are 3.5% for molecular-testing
completion, 6% for treatment adherence, 4.5% for follow-up completion, 7% for
psychosocial screening, and 8% for survivorship-plan completion. Records with
no recent survivorship care receive a small additional documentation penalty;
the differential-missingness and site-variation scenarios add further targeted
missingness.

These probabilities are deliberately plausible stress-test settings informed
by the reviewed adherence, survivorship, follow-up, and registry literature.
They are not pooled prevalence estimates and must not be cited as observed
CCDI missingness. Missing values are introduced after complete latent records
are generated so the software can distinguish undocumented care from a
documented negative care outcome.

## Reproducibility

The generator uses a deterministic pseudorandom seed. A scenario, cohort size,
seed, schema version, and software version are sufficient to reproduce a cohort.
