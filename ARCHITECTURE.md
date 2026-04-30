# ARCHITECTURE.md -- Experiment Infrastructure

> **Purpose:** This document defines the standard anatomy for running experiments against LLMs, storing results, and analyzing them. It is the authoritative reference for folder structure, data formats, and the contract an experiment must fulfill. All experiments share a common infrastructure; experiment authors write only what is unique to their experiment.

---

## Folder Structure

```
models/                          Shared model registry
  anthropic.json
  openai.json
  google.json
  together.json
  xai.json

runner/                          Shared execution engine
  run.py                         Core runner (model + experiment -> results)
  providers/                     Vendor-specific API adapters
    anthropic.py
    openai.py
    google.py
    together.py
    xai.py

results/                         Unified result storage
  {experiment}/
    {vendor}_{model}/
      {timestamp}/
        responses.jsonl          One envelope per response
        run_meta.json            Run-level metadata (parameters, timing, errors)

analysis/                        Shared analysis library (tier 2)
  quality.py                     Response quality checks, completion rates
  drift.py                       Drift metrics across dimensions
  emd.py                         Earth mover's distance calculations
  cluster.py                     Cluster analysis
  factor.py                      Factor analysis (PAF, loadings)
  geometry.py                    Judgment geometry, MDS
  stats.py                       Permutation tests, bootstrap, effect sizes
  explanation.py                 Thematic coding, consistency, nonsense detection
  compare.py                     Cross-model comparison utilities

ui/                              Local web application
  index.html                     Run picker + progress display
  report.html                    Generic reporting (works for any experiment)

experiments/                     Per-experiment definitions
  {name}/
    config.json                  Stimuli, prompts, parameters, field map
    parse.py                     Response parser (raw -> structured)
    stimuli/                     Scenario files, probe inventories
    analyze.py                   Experiment-specific analysis (imports from analysis/)
    report.html                  Optional custom reporting view
```

---

## Model Registry

Each vendor file lists available models with the information the runner needs.

```json
{
  "vendor": "anthropic",
  "api_base": "https://api.anthropic.com/v1",
  "auth_env_var": "ANTHROPIC_API_KEY",
  "models": [
    {
      "id": "claude-opus-4-20250514",
      "label": "Opus 4",
      "max_tokens": 4096,
      "supports_temperature": true
    },
    {
      "id": "claude-sonnet-4-20250514",
      "label": "Sonnet 4",
      "max_tokens": 4096,
      "supports_temperature": true
    }
  ]
}
```

The UI reads these files to populate the model picker, grouped by vendor.

---

## Result Envelope

Every response from every experiment is stored in this format. One JSON object per line in `responses.jsonl`.

```json
{
  "experiment": "rcp",
  "model": "claude-opus-4-20250514",
  "vendor": "anthropic",
  "timestamp": "2026-04-10T14:30:00Z",
  "stimulus_id": "phys_01",
  "stimulus_text": "...",
  "prompt_template": "unframed",
  "iteration": 1,
  "raw_response": "...",
  "parsed": {},
  "meta": {
    "tokens_in": 245,
    "tokens_out": 180,
    "latency_ms": 1200,
    "temperature": 0.7,
    "max_tokens": 4096
  }
}
```

**Standard fields** (all experiments, populated by the runner):
- `experiment`: experiment name matching the folder name
- `model`: full model ID from the registry
- `vendor`: vendor name from the registry
- `timestamp`: ISO 8601, UTC
- `stimulus_id`: identifier for the specific stimulus presented
- `stimulus_text`: the full text sent to the model (after template rendering)
- `prompt_template`: which prompt template was used (e.g., "unframed", "collectivist", "nonsense")
- `iteration`: iteration number when running repeated trials
- `raw_response`: the complete model response before parsing
- `meta`: run metadata populated by the runner

**Experiment-defined fields** (populated by the experiment's parser):
- `parsed`: structure defined by the experiment's config.json schema

The runner writes everything except `parsed`. The experiment's parser fills `parsed` from `raw_response`.

---

## Experiment Contract

To plug into the infrastructure, an experiment provides three things:

### 1. config.json

```json
{
  "name": "rcp",
  "description": "Relational Consistency Probing",
  "version": "3.0",

  "stimuli_path": "stimuli/probes.json",

  "prompt_templates": {
    "unframed": "stimuli/templates/unframed.txt",
    "collectivist": "stimuli/templates/collectivist.txt",
    "nonsense": "stimuli/templates/nonsense.txt"
  },

  "parameters": {
    "iterations": 5,
    "temperature": 0.7,
    "max_tokens": 4096
  },

  "parsed_schema": {
    "probe_id": "string",
    "domain": "string",
    "anchor": "string",
    "frame": "string",
    "judgment": "number",
    "explanation": "string",
    "consistency_pair": "string",
    "expected_direction": "string"
  },

  "field_map": {
    "grouping_variable": "domain",
    "primary_score": "judgment",
    "explanation_field": "explanation"
  }
}
```

The `parsed_schema` declares what the parser produces. The `field_map` tells shared analysis methods where to bind:

- `grouping_variable`: the field used to group results by category (domain, dimension, etc.)
- `primary_score`: the main numeric outcome (judgment value, weight allocation, etc.)
- `secondary_score`: optional second signal (reasoning weights, etc.)
- `explanation_field`: where the model's explanation text lives

### 2. parse.py

A module exposing a `parse(raw_response, stimulus, template_name) -> dict` function. Input is the raw model output plus context. Output matches `parsed_schema`. Returns a dict that the runner inserts into the envelope's `parsed` field.

The parser also handles data quality checks and flags issues in the returned dict (e.g., `data_quality.r_zero`, `data_quality.weights_sum_to_1`).

### 3. stimuli/

The stimulus files in whatever format the experiment needs. The config points to them. The runner loads them and iterates.

---

## The Field Map and Shared Analysis

Tier 2 analysis methods accept a field map so they can operate on any experiment's data without experiment-specific code.

Example: drift calculation.

```python
from analysis.drift import calculate_drift

# The method reads the field map from config.json
# It knows to group by "domain" and measure drift on "judgment"
# without knowing anything else about RCP
results = calculate_drift(
    run_path="results/rcp/anthropic_claude-opus-4/2026-04-10T143000/",
    config_path="experiments/rcp/config.json"
)
```

The same call works for the Reasoner experiment. The field map says group by "dimension" and measure on "judgment_weights". The drift method does not change.

---

## Analysis Tiers

**Tier 1: Infrastructure (built into runner and UI)**
- Response quality: completion rates, parse failures, token usage, error logs
- Run comparison: same experiment across models, side by side
- Generic distribution views

**Tier 2: Shared methods (analysis/ library)**
- Each module is a standalone method operating on the common envelope
- Binds to experiment data via the field map
- Experiment calls what it needs; no method knows about specific experiments

**Tier 3: Experiment-specific (experiments/{name}/analyze.py)**
- Imports tier 2 methods
- Adds logic unique to the experiment (e.g., nonsense compliance matrix, consistency pair analysis)
- Produces experiment-specific outputs

---

## Run Metadata

Each run directory includes `run_meta.json`:

```json
{
  "experiment": "rcp",
  "model": "claude-opus-4-20250514",
  "vendor": "anthropic",
  "started": "2026-04-10T14:30:00Z",
  "completed": "2026-04-10T15:45:00Z",
  "parameters": {
    "iterations": 5,
    "temperature": 0.7,
    "max_tokens": 4096,
    "templates_used": ["unframed", "collectivist", "nonsense"]
  },
  "counts": {
    "stimuli": 33,
    "templates": 3,
    "iterations": 5,
    "expected_responses": 495,
    "actual_responses": 490,
    "parse_failures": 3,
    "api_errors": 2
  }
}
```

---

## UI Workflow

1. Open `ui/index.html` in a browser.
2. Left panel: model picker (grouped by vendor, populated from model registry).
3. Right panel: experiment picker (populated by scanning experiments/ for config.json files).
4. Select one or more models and one experiment.
5. Configure parameters (defaults from config.json, overridable).
6. Run. Progress displayed in real time.
7. On completion, link to generic report view or experiment-specific report if one exists.

---

## Adding a New Experiment

1. Create `experiments/{name}/`.
2. Write `config.json` declaring stimuli, templates, parameters, parsed schema, and field map.
3. Write `parse.py` with a `parse()` function matching the schema.
4. Add stimulus files to `stimuli/`.
5. Optionally write `analyze.py` for experiment-specific analysis and `report.html` for custom reporting.
6. The experiment appears in the UI automatically.

---

## Adding a New Model

1. Add the model entry to the appropriate vendor file in `models/`.
2. If the vendor is new, create a vendor config file and a provider adapter in `runner/providers/`.
3. The model appears in the UI automatically.

---

## Conventions

- All timestamps UTC, ISO 8601.
- All JSON files use 2-space indentation.
- JSONL for result streams (one envelope per line).
- Python 3.10+ for all scripts.
- Experiment names are lowercase, hyphenated (e.g., `rcp`, `reasoner`, `curriculum-ordering`).
- Model directories in results use `{vendor}_{model-id}` naming.
- Author-name citations in all documentation (number only at final submission).
