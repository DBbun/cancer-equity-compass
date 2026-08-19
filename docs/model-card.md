# Demonstration model card

## Model

Synthetic two-year adverse-outcome risk score generated from known simulated relationships among age, cancer type, risk group, treatment, adherence, and care completion.

## Purpose

Demonstrate that the Auditor can detect injected representation, missingness, care-access, calibration, and threshold-performance gaps.

## Not valid for

- Estimating risk for any real patient.
- Comparing real institutions or demographic populations.
- Selecting treatment or changing clinical care.
- Establishing that a disparity or discriminatory process exists.

## Ground truth

Scenario settings intentionally alter data generation and model behavior. Because the affected populations and mechanisms are known, metric calculations can be checked against expected direction and magnitude.

## Prediction origin and horizon

The outcome horizon is 24 months. The prediction origin is a fixed landmark exactly 180 days after the simulated diagnosis date. Predictors represent information available by that landmark. Outcome follow-up starts the next day. Every future published-model adapter must preserve the model's original index event, predictor-availability window, outcome definition, censoring rules, and horizon.

## Outcome and censoring

The latent adverse outcome is sampled from a logistic mechanism using baseline disease risk, age, treatment receipt, early adherence, baseline adverse events, cost barriers, transition readiness, and scenario effects. An observed event receives an `outcome_date`. Participants observed without an event for 24 months receive `outcome_2y=0`. Participants lost before the event or administrative horizon receive `outcome_2y=null`, a `last_contact_date`, and `lost_to_followup=1`; they are not counted as event-free. Current binary fairness metrics use records with observed outcomes and do not yet adjust for informative censoring.

## Evaluation

The prototype reports cohort size, event prevalence, Brier score, AUC, observed-to-expected ratio, sensitivity, specificity, positive predictive value, false-positive rate, false-negative rate, selection rate, and directional gaps between a comparison and reference population.

Synthetic-data verification currently measures reproducibility, schema validity, known-scenario recovery, eligibility and pathway integrity, missingness behavior, and bounded metric calculations. It does not measure fidelity to CCDI participants. External validation will add marginal-distribution distances, dependence-structure error, real-versus-synthetic classifier performance, train-on-synthetic/test-on-real utility, temporal fidelity, and disclosure-risk tests.

## Limitations

The generator simplifies cancer heterogeneity, sex and gender, race and ethnicity, treatment pathways, censoring, competing risks, and causal structure. `followup_complete` is a care/documentation measure; `lost_to_followup` is the censoring indicator. Real deployment requires clinically governed definitions, validated mappings, informative-censoring analysis, uncertainty analysis, confounding assessment, causal estimands where appropriate, and external evaluation. Future treated-versus-untreated comparisons require target-trial emulation rather than crude outcome contrasts.
