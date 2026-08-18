# Evidence-to-variable matrix

This matrix is based on direct text extraction from the local publications listed
below. It distinguishes reported evidence from the Compass's current synthetic
engineering parameters. No participant-level source data were used.

| Source | Population and design | Reported variables or results | Compass use | Guardrail |
|---|---|---|---|---|
| Kartoun et al., *Scientific Reports* 2022, plus supplement | CHARGE-AF and PCE evaluated in three cohorts covering millions of records | Subpopulation discrimination, calibration, standardized hazard ratios, statistical parity; important heterogeneity by age, sex, and disease | Preserve separate ranking, calibration, threshold, and population audit layers; require intersectional subgroup evaluation | Cardiovascular thresholds and observed gaps are not transferred to cancer |
| Kagamanov et al., 2021 | Retrospective Ontario cohort of 1,574 five-year AYA survivors diagnosed at 15-20.9 years; mean 9.2 years of follow-up | Specialized survivor, general cancer, and family-physician care models; guideline-eligible cardiomyopathy and breast surveillance; adherence transitions | `care_model`, surveillance eligibility, follow-up completion, and time since diagnosis | Reported surveillance rates describe a specific historical Canadian cohort, not a universal baseline |
| McGrady et al., 2023 | Multisite longitudinal study of 65 AYAs aged 15-24 with electronic medication monitoring over 12 months | Barrier count associated with lower electronically monitored and self-reported adherence; heterogeneous barrier patterns | `cost_barrier`, adherence process, transition/readiness construct, personalized scenario testing | Small study; current synthetic coefficients are not fitted from its beta estimates |
| Robles et al., 2024 | COG ALL adherence cohort; English-speaking non-Hispanic White n=159, Hispanic Spanish-speaking n=59, Hispanic English-speaking n=109 | Median 6MP adherence differed by ethnicity grouping; Spanish language was not associated with lower adherence within Hispanic participants | Include language separately from ethnicity and avoid treating language as a proxy cause | Do not inject a Spanish-language penalty; the paper specifically cautions against that inference |
| Schulte et al., AYA TEAMS cohort profile | 587 AYA survivors aged 16-25 across three pediatric centers, longitudinal follow-up | Transition readiness, self-management, psychosocial risk, treatment modalities and intensity, late effects, LTFU engagement; site differences and selection limitations | `transition_readiness`, `care_model`, psychosocial screening, site-level variation, years since diagnosis | English-speaking and already-engaged eligibility limits generalizability |
| Alchin et al., 2022 | Re-engage survivorship program, 25 long-term survivors, mean age 31.9 | Recommendations given, recalled, and followed; average 6.6 given, 1.9 recalled at six months, 1.3 followed; 56% followed none | Add recommendation cascade fields and check monotonic consistency | Very small intervention cohort; exact rates are not used as population parameters |
| Tai et al., 2012 | BRFSS cross-sectional comparison: 4,054 AYA survivors and 345,592 people without cancer history | Chronic conditions, mental and physical health, insurance, cost-related inability to obtain care, routine checkups | Add access/cost barrier and later-effects outcome domains | Self-report, cross-sectional design, and diagnosis years 15-29 constrain inference |
| Anderson et al., 2020 | Utah population study of 6,330 AYA survivors, 12,924 siblings, and 18,171 matched comparators | First and recurrent hospitalization, competing risk, cancer-specific heterogeneity, time since diagnosis | Candidate future hospitalization and recurrent-event synthetic outcomes | Utah population and historical treatment patterns may not generalize |
| Chow et al., 2018 | CCSS n=13,060 with external validation in SJLIFE n=1,842 and Emma cohort n=1,362 | Sex, chemotherapy, cranial/neck/chest radiation; ischemic heart disease and stroke through age 50; AUC and concordance | Add treatment-exposure fields and a future executable late-effects model adapter | Survivor model applies after five-year survival and should not be mixed with acute treatment outcome prediction |
| Clark et al., 2020 | Female CCSS survivors n=5,886; external SJLIFE n=875 | Abdominal/pelvic or ovarian radiation, alkylating-agent dose, HSCT, age-at-diagnosis interaction; AOF within five years | Add radiation, alkylator, HSCT, age, and sex eligibility fields | Outcome applies only to an eligible female survivor population |
| Moskowitz et al., 2021 | Female five-year childhood-cancer survivors treated with chest radiation; derivation n=1,120, validation n=1,027 | Current age, radiation field/timing, anthracycline exposure, menopause, first-degree family history; ten-year breast-cancer risk | Add chest radiation and anthracycline exposure; future model-specific eligibility gate | Not a general breast-cancer model and not applicable without chest-radiation eligibility |
| Zhang et al., 2023 | SEER cohort of 401,264 unique patients first diagnosed before age 40 | Long-term survival and second-malignancy Random Survival Forests; demographics, tumor site/morphology/stage, censoring, multiple tumors | Retain time-to-event/censoring fields and plan second-malignancy outcome; audit model performance by pediatric/adolescent/young-adult strata | Retrospective registry model; high reported performance requires independent validation and leakage review |
| van den Heuvel-Eibrink et al., 2021 Wilms tumor review | Review of prognostic factors for recurrence in patients younger than 18, emphasizing COG and SIOP differences | Stage, histology, age, tumor weight/volume, lung-nodule response, combined LOH 1p/16q, 1q gain, and treatment approach | Add Wilms-specific stage, histology, and genomic-marker fields; preserve classification-system provenance | COG and SIOP use different treatment timing and tissue contexts; the demonstration must not collapse them into one official rule |
| Meany, 2019 and Monclair et al., 2009 | Neuroblastoma classification review and international pretreatment staging work; INRGSS outcome analysis included 661 European patients | Age, L1/L2/M/MS stage, image-defined risk factors, histology, MYCN, ploidy, and segmental chromosomal aberrations | Add neuroblastoma-specific fields and derive a transparent demonstration risk grouping | The generated grouping is illustrative, not an executable INRG treatment assignment |
| Australian AYA Optimal Care Pathway and New Zealand AYA Standards | Multidisciplinary standards spanning diagnosis through survivorship and transition | Psychosocial assessment, fertility risk/preservation, adherence risk, care coordination, transition planning, pathway measurement | Extend future pathway state machine beyond treatment receipt to documented needs, referrals, and transitions | Standards define expected processes, not observed completion probabilities |
| CCDI Submission Guide | Public CCDI submission workflow and metadata guidance | Required Study, Study_admin, Study_funding, Study_personnel, Publication, Participant, and Diagnosis sheets; optional treatment, response, survival, and file nodes; controlled vocabularies, validation, provenance | Add a multi-table demonstration adapter and versioned mapping boundary | Current JSON bundle is not the official Excel template and must not be submitted as one |

## Design decisions produced by the review

1. Clinical eligibility must precede every care-rate denominator.
2. Language, ethnicity, insurance/cost barriers, and site are separate constructs.
3. A care recommendation has at least three states: given, recalled, completed.
4. Acute outcomes, surveillance adherence, late effects, and second malignancies
   need separate time origins and eligible populations.
5. Treatment-exposure variables are required before implementing published
   survivor risk models.
6. Fairness auditing must report discrimination, calibration, threshold behavior,
   subgroup sample size, and intersectional robustness separately.
7. Published point estimates may calibrate optional scenarios only after their
   population and outcome definitions are reproduced and uncertainty is retained.

## Next review tranche

The next extraction pass should obtain the machine-readable CCDI Data Model and
Metadata Submission Template version intended for the challenge. The current
PDFs expose the node structure but not enough property-level detail for an
official mapping. Fertility preservation and psychosocial referral should then be
implemented as eligibility-aware pathway events.
