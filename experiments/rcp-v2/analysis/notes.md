# RCP V2 Analysis Pipeline

## Scripts

### permutation_tests.py
Pre-registered ordinal test (reports structural failure at ~16.7%) and
magnitude-based alternative (shuffles domain labels, compares group mean
differences). Reads report-lite.json.

```bash
python analysis/permutation_tests.py reports/rcp-v2-temp07/report-lite.json
python analysis/permutation_tests.py reports/rcp-v2-temp07/report-lite.json -o analysis/permutation_results.json
```

### factor_analysis.py
PCA on unframed similarity matrices (pre-registered). Reports eigenvalues,
variance explained, component-domain alignment, and per-concept loadings.
Reads similarity matrices from the cluster_validation section of report-lite.json.

```bash
python analysis/factor_analysis.py reports/rcp-v2-temp07/report-lite.json
python analysis/factor_analysis.py reports/rcp-v2-temp07/report-lite.json -o analysis/pca_results.json
```

## Data flow

```
results/rcp-v2/           Raw JSONL responses
    |
    v
build_report.py            Aggregates into report.json
    |
    v
split_report.py            Splits into report-lite.json + explanations.json
    |
    v
analysis/                  Statistical tests on report-lite.json
    permutation_tests.py
    factor_analysis.py
```

## Dependencies

Both scripts require numpy. No additional dependencies beyond what
requirements.txt provides.
