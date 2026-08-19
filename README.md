# Sub-population Fairness & Readiness Auditor for CCDI

A privacy-first, browser-based toolkit for evaluating whether childhood and adolescent and young adult (AYA) cancer datasets, care pathways, and prediction models work consistently across patient populations.

**Live application:** https://dbbun.github.io/cancer-equity-compass/

This repository is an early working prototype for **Phase I, Track 1, Milestone 1** of the NIH/NCI Childhood, Adolescent and Young Adult Cancer Data Innovation Challenge. It uses only simulated patients. It does not contain CCDI participant data and does not make claims about real-world disparities or clinical validity.

## Five modules

1. **Synthetic Cohort Generator** creates reproducible cancer cohorts with configurable, known data and care gaps.
2. **Data Readiness Auditor** measures representation, missingness, coding validity, follow-up completeness, and subgroup sample adequacy.
3. **Care-Gap Analyzer** evaluates testing, treatment, adherence, and monitoring conditional on documented eligibility.
4. **Model Fairness Auditor** separates ranking, calibration, and threshold behavior across populations.
5. **CCDI Integration Layer** validates a documented canonical CSV/JSON contract and keeps all computation in the browser.

The integration layer can also export a disclosure-conscious aggregate audit
report containing the active configuration, readiness measures, care rates,
model performance, and directional fairness results. Participant-level rows are
not included in this report, and results for groups below the documented minimum
reporting size are suppressed.

The model-assurance view includes population-overlaid predicted-risk
histograms, subgroup calibration plots, age-stratified outcome/prediction/flag
rates, and fairness gaps across a range of decision thresholds. Calibration
bands with fewer than 30 records are omitted from the visual display. Data
readiness uses a population-by-field missingness heatmap, while care processes
are presented as completion, reference-gap, and pathway-cascade charts.

Generation produces an immediate confirmation and a configurable Table 1 with
demographic, cancer, treatment, care, and outcome characteristics. Continuous
variables include mean, standard deviation, median, interquartile range,
Welch's t test, and Mann-Whitney U test; categorical variables use chi-square
tests. Baseline documentation missingness is present in every synthetic
scenario and is documented in the synthetic-data specification.

The generator uses seeded pseudorandom draws with explicit conditional
relationships; it does not create independent random columns. Cancer grouping,
age, risk, treatment exposure, care setting, access barriers, and scenario
settings influence downstream eligibility, care, outcomes, and predictions.
The current parameters are engineering assumptions rather than fitted CCDI
estimates. The specification states the implicit analysis baseline, 24-month
horizon, current loss-to-follow-up limitation, validation tests, and planned
fidelity, privacy, confounding, and causal extensions.

The live fairness chart visualizes statistical-parity difference,
true-positive-rate difference, true-negative-rate difference,
false-negative-rate difference, and false-positive-rate difference with 95%
intervals for differences in proportions. Threshold-dependent outputs update
in real time and are presented immediately below the controls.

## Active risk score and threshold

The current executable score is a **synthetic two-year adverse-outcome
probability**. It was built to exercise the audit software and is not a
published or clinically validated cancer score. A threshold converts that
continuous probability into a binary model-positive classification. For
example, at 20%, records with predicted risk at or above 0.20 are flagged.
The 20% default is exploratory and is not a treatment recommendation.

A clinically usable threshold must be tied to a named model, eligible
population, outcome, time horizon, intended intervention, and supporting
publication or guideline. The UI therefore shows how fairness measures change
across thresholds instead of implying that one cutoff applies across cancers.

## Run locally

No build step is required.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Test

```bash
npm test
```

## Publication surfaces

The same static site can be published with GitHub Pages and mirrored in a
Hugging Face Static HTML Space. See [deployment guidance](docs/deployment.md).
Only synthetic, aggregate, or otherwise authorized disclosure-controlled
material belongs in a public deployment.

## Repository governance

- Apache-2.0 license
- machine-readable citation metadata
- automated tests for synthetic scenarios and core measures
- security and controlled-data handling guidance
- versioned canonical JSON Schema

## Data contract

The canonical demonstration schema is documented in [`docs/data-contract.md`](docs/data-contract.md) and machine-readable in [`data/canonical-schema.json`](data/canonical-schema.json). The adapter is designed for later alignment with CCDI specifications in collaboration with NCI/CCDI; current field mappings must not be represented as an official CCDI endorsement or completed integration.

The data-generating process, covariate relationships, prediction origin,
quality checks, and future validation work are documented in the
[formatted synthetic-data specification](docs/synthetic-data-specification.html)
([Markdown source](docs/synthetic-data-specification.md)).
An evidence-to-variable matrix based on direct review of the local literature is
maintained in [`docs/literature-topic-map.md`](docs/literature-topic-map.md).
Published estimates remain separate from the current engineering parameters unless
a scenario explicitly documents its source population and assumptions.

## Safety and intended use

- Research, software evaluation, and governance support only.
- Not for diagnosis, treatment selection, or patient-level clinical decisions.
- A measured difference is a review signal, not proof of discrimination.
- Interpret metrics alongside clinical need, disease biology, data provenance, uncertainty, and sample size.
- Do not upload controlled-access or identifiable data to a public deployment.

## Scientific foundation

The model-fairness workflow is directly informed by:

Kartoun U, Khurshid S, Kwon BC, Patel AP, Batra P, Philippakis A, Khera AV,
Ellinor PT, Lubitz SA, Ng K. [Prediction performance and fairness heterogeneity
in cardiovascular risk models](https://doi.org/10.1038/s41598-022-16615-3).
*Scientific Reports*. 2022;12(1):12542. PMID: 35869152; PMCID:
[PMC9307639](https://pmc.ncbi.nlm.nih.gov/articles/PMC9307639/).

That publication provides the methodological starting point for examining
performance and fairness heterogeneity across clinically relevant
subpopulations rather than relying only on pooled model performance. The
The Auditor adapts that measurement philosophy to synthetic
childhood and AYA cancer demonstrations while adding data-readiness,
eligibility-conditioned care-pathway, survivorship, and CCDI adaptation
modules. The current synthetic risk model is not a cancer-specific clinical
model and should not be represented as validation of the cardiovascular
models or as clinical evidence in cancer.

Cancer-specific evidence reviewed for the data model and planned adapters
includes:

- Chow EJ et al. Prediction of ischemic heart disease and stroke in survivors
  of childhood cancer. *Journal of Clinical Oncology*. 2018.
- Clark RA et al. Predicting acute ovarian failure in female childhood cancer
  survivors. *Lancet Oncology*. 2020.
- Moskowitz CS et al. Development and validation of a breast cancer risk
  prediction model for childhood cancer survivors treated with chest radiation.
  *Journal of Clinical Oncology*. 2021. DOI: 10.1200/JCO.20.02244.
- van den Heuvel-Eibrink MM et al. Prognostic factors and risk stratification
  for Wilms tumor. 2021.
- Monclair T et al. The International Neuroblastoma Risk Group staging system.
  2009.

The evidence-to-variable matrix in
[`docs/literature-topic-map.md`](docs/literature-topic-map.md) records source
populations, variables, intended Auditor use, and applicability guardrails.

## License

Apache-2.0. Synthetic demonstration records are generated by the software and contain no real patients.
