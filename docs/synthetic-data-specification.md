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

## Prediction origin, horizon, and follow-up

The current demonstration score predicts a synthetic adverse outcome within 24
months. Its prediction origin is an **implicit analysis baseline after diagnosis,
disease classification, treatment exposure, and the represented care-process
variables have been assigned**. The prototype does not yet include a calendar
`index_date`, and it must not be interpreted as a diagnosis-time model or a
treatment-start model. A published-model adapter must explicitly define its
eligible population, index event/date, look-back window, predictor availability,
outcome, competing events, censoring rules, and prediction horizon.

`followup_complete` is a simulated care/documentation measure. It is distinct
from the time-to-event fields. For the current engineering demonstration,
`event_observed` equals the two-year binary outcome; records without the outcome
receive a simulated observation time late in the 24-month window. Thus, the
prototype does **not** yet model loss to follow-up as informative censoring and
does not estimate inverse-probability-of-censoring weights. This limitation is
deliberate and documented so that a missing follow-up record is not mistaken for
a known absence of an outcome.

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

Future work will add explicit index dates, longitudinal encounters, competing
risks, administrative and informative censoring, and loss-to-follow-up
mechanisms. It will also distinguish descriptive fairness audits from causal
questions. Directed acyclic graphs, prespecified confounders, propensity or
weighting methods, doubly robust estimators, sensitivity analyses for
unmeasured confounding, and transportability checks may be added when the data,
estimand, and governance support them. These methods will not convert an
observational disparity into a causal claim without defensible assumptions.

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
