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

## Evaluation

The prototype reports cohort size, event prevalence, Brier score, AUC, observed-to-expected ratio, sensitivity, specificity, positive predictive value, false-positive rate, false-negative rate, selection rate, and directional gaps between a comparison and reference population.

## Limitations

The generator simplifies cancer heterogeneity, sex and gender, race and ethnicity, treatment pathways, censoring, competing risks, and causal structure. Real deployment requires clinically governed definitions, validated mappings, uncertainty analysis, and external evaluation.
