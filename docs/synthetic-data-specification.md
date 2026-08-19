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

## Randomness and covariate dependence

The records are simulated with a deterministic pseudorandom number generator,
but the fields are **not sampled independently**. The seed controls repeatable
random draws; conditional rules create the dependency structure. Examples
include:

- cancer grouping influences the probability of high-risk classification,
  disease-specific stage and markers, chemotherapy dose bands, radiation, and
  hematopoietic stem-cell transplantation;
- age and treatment exposure determine eligibility for fertility-related care;
- age, cost barriers, care setting, and the selected scenario affect follow-up
  and other care-process completion;
- transition readiness, cost barriers, and upstream recommendations determine
  recommendation recall and completion; and
- risk group, age, treatment receipt, adherence, follow-up, adverse events, and
  the selected scenario determine the latent two-year outcome probability.

These are transparent engineering relationships intended to exercise the audit
workflow. They are not fitted estimates of the joint distribution in CCDI or
another clinical population. The current generator does not reproduce every
real interaction, treatment-selection process, site effect, or temporal
dependency.

## Prediction origin, horizon, outcome, and follow-up

The current demonstration uses a fixed landmark design. `diagnosis_date` is
simulated, and **`index_date` is exactly 180 days after diagnosis**. Variables
used by the prediction score represent information available by that landmark.
The score predicts a synthetic adverse outcome during the next 24 months. This
common time origin allows treated and untreated participants to enter follow-up
at the same elapsed time and avoids defining baseline by a future event such as
treatment completion.

The latent binary outcome is sampled from a logistic mechanism using baseline
risk group, age group, treatment receipt, early adherence, baseline adverse
events, cost barriers, transition readiness, and scenario effects. A latent
event receives a simulated date within the 24-month window. Separately, a
loss-to-follow-up time is sampled using follow-up completion, cost barriers, and
AYA status. If the event occurs before loss to follow-up, `outcome_2y=1` and
`outcome_date` is recorded. If no event occurs and 24 months are observed,
`outcome_2y=0`. If contact ends first without an observed event,
`outcome_2y=null`, `lost_to_followup=1`, and `last_contact_date` records the
censoring date. A censored record is therefore not misclassified as event-free.

`followup_complete` remains a care/documentation measure and is distinct from
`lost_to_followup`. The current fairness metrics use only records with observed
binary outcomes. The generator now represents right censoring, but it does not
yet correct for informative censoring with inverse-probability weights or model
competing events. A published-model adapter must explicitly define its eligible
population, index event/date, look-back window, predictor availability, outcome,
competing events, censoring rules, and prediction horizon.

## Current quality checks

Quality is evaluated against the generator's known specification, not against
real patients. Automated tests currently check deterministic reproduction from
the same seed, schema and range validity, nonzero baseline missingness, targeted
scenario signals, pathway ordering and eligibility logic, identifier and node
relationships, CSV round trips, bounded performance measures, and recovery of
injected access, site, survivorship, and calibration problems. These tests answer
whether the software reproduces its documented mechanism and detects its known
failure modes. They do not establish clinical realism or external validity.

## Planned fidelity, utility, and privacy evaluation

When an authorized CCDI reference cohort and governance-approved variable set
are available, a versioned validation report will compare real and synthetic
aggregate distributions without publishing participant-level data. Planned
measures include:

- **Marginal fidelity:** prevalence and quantile differences, standardized mean
  differences, total-variation or Jensen-Shannon distance for categorical
  distributions, and Wasserstein distance for continuous variables.
- **Dependence fidelity:** Pearson/Spearman correlation error, Cramer's V,
  mutual-information comparisons, and clinically selected cross-tabulations.
- **Multivariable utility:** a real-versus-synthetic classifier AUC, train-on-
  synthetic/test-on-real performance, calibration and discrimination deltas,
  and recovery of prespecified subgroup effects.
- **Temporal fidelity:** follow-up-time and censoring distributions,
  Kaplan-Meier or cumulative-incidence differences, and horizon-specific
  calibration where the outcome supports those methods.
- **Privacy risk:** exact-duplicate checks, nearest-neighbor distance, record-
  linkage stress tests, and membership- or attribute-inference evaluation
  appropriate to the release policy.

No single score will be labeled synthetic-data "accuracy." A quality profile
will report fidelity, analytical utility, fairness-signal recovery, and privacy
risk separately, because optimizing one can degrade another.

## Future causal and longitudinal extensions

Future work will add richer longitudinal encounters, competing risks, and
adjustment for informative censoring. It will also distinguish descriptive fairness audits from causal
questions. Directed acyclic graphs, prespecified confounders, propensity or
weighting methods, doubly robust estimators, sensitivity analyses for
unmeasured confounding, and transportability checks may be added when the data,
estimand, and governance support them. These methods will not convert an
observational disparity into a causal claim without defensible assumptions.

For treated-versus-untreated comparisons, future work will emulate a target
trial anchored at diagnosis or the day-180 landmark. Eligibility, treatment
strategies, assignment, follow-up, outcome, estimand, and analysis will be
prespecified. Baseline confounding, treatment-selection bias, immortal-time
bias, treatment changes, adherence, informative censoring, and positivity will
be addressed explicitly. Candidate estimands include intention-to-treat and
per-protocol effects, using propensity weighting or matching, outcome
regression, doubly robust estimation, and sensitivity analyses as appropriate.

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
