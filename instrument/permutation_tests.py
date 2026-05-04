#!/usr/bin/env python3
"""
permutation_tests.py - Pre-registered and magnitude-based permutation tests.

Reads report-lite.json (or report.json) and runs:
  1. Ordinal permutation test (pre-registered): count how often shuffled
     domain labels produce the P < I < M ordering. Reports the structural
     limitation (~16.7% for all orderings).
  2. Magnitude permutation test: for each pair of domains, count how often
     shuffled labels produce a mean difference as large as observed.
     Three comparisons: moral>physical, institutional>physical, moral>institutional.

Usage:
    python permutation_tests.py path/to/report-lite.json
    python permutation_tests.py path/to/report-lite.json --output results.json
    python permutation_tests.py path/to/report-lite.json --permutations 50000
"""

import argparse
import json
from collections import Counter

import numpy as np


CULTURAL_FRAMINGS = ["individualist", "collectivist", "hierarchical", "egalitarian"]


def load_sensitivity_data(report_path: str) -> tuple:
    """Load concept-level sensitivity data and domain map from report.

    Returns (models, domains, sensitivity_data) where:
      - models: list of model names
      - domains: dict mapping concept -> domain
      - sensitivity_data: dict[model][concept] -> {framing: drift_value}

    Raises FileNotFoundError if report_path does not exist.
    Raises ValueError if the report has no fsi_heatmap section.
    """
    with open(report_path) as f:
        report = json.load(f)

    sens = None
    for section in report["sections"]:
        if section.get("type") == "fsi_heatmap":
            sens = section
            break

    if sens is None:
        raise ValueError(f"No fsi_heatmap section found in {report_path}")

    return sens["models"], sens["domains"], sens["data"]


def compute_concept_drifts(model_data: dict, domains: dict, framings: list) -> tuple:
    """Compute mean cultural drift per concept.

    Returns (concepts, drifts, labels) as numpy arrays.
    """
    concepts = list(model_data.keys())
    drifts = np.array([
        np.mean([model_data[c][f] for f in framings])
        for c in concepts
    ])
    labels = np.array([domains[c] for c in concepts])
    return concepts, drifts, labels


def ordinal_test(drifts: np.ndarray, labels: np.ndarray, n_perms: int,
                 rng: np.random.Generator) -> dict:
    """Pre-registered ordinal permutation test.

    Counts how often shuffled labels produce each of the six possible
    orderings of three domain means. Reports the frequency of the
    pre-registered P < I < M ordering.
    """
    ordering_counts = Counter()

    for _ in range(n_perms):
        shuf = rng.permutation(labels)
        means = {
            d: np.mean(drifts[shuf == d])
            for d in ["physical", "institutional", "moral"]
        }
        ranked = sorted(means.items(), key=lambda x: x[1])
        ordering = "<".join(r[0][0].upper() for r in ranked)
        ordering_counts[ordering] += 1

    # Use (count + 1) / (n + 1) because the observed data is itself
    # one of the possible permutations.
    p_pim = (ordering_counts.get("P<I<M", 0) + 1) / (n_perms + 1)

    return {
        "test": "ordinal",
        "hypothesis": "P < I < M",
        "p_value": round(p_pim, 6),
        "all_orderings": {
            k: {"count": v, "proportion": round(v / n_perms, 4)}
            for k, v in ordering_counts.most_common()
        },
        "n_permutations": n_perms,
        "note": "All six orderings occur at ~16.7% under shuffling regardless "
                "of effect size. This test is structurally insensitive to "
                "magnitude differences between domain means.",
    }


def magnitude_test(drifts: np.ndarray, labels: np.ndarray,
                   domain_high: str, domain_low: str,
                   n_perms: int, rng: np.random.Generator) -> dict:
    """Magnitude-based permutation test.

    Tests whether the observed difference between two domain means
    exceeds what would occur under random label assignment.

    Uses (count + 1) / (n + 1) to avoid reporting p = 0.0.
    """
    obs_high = np.mean(drifts[labels == domain_high])
    obs_low = np.mean(drifts[labels == domain_low])
    obs_diff = obs_high - obs_low

    count = 0
    for _ in range(n_perms):
        shuf = rng.permutation(labels)
        diff = np.mean(drifts[shuf == domain_high]) - np.mean(drifts[shuf == domain_low])
        if diff >= obs_diff:
            count += 1

    p = (count + 1) / (n_perms + 1)

    return {
        "test": "magnitude",
        "comparison": f"{domain_high} > {domain_low}",
        "mean_high": round(obs_high, 4),
        "mean_low": round(obs_low, 4),
        "observed_difference": round(obs_diff, 4),
        "p_value": round(p, 6),
        "n_permutations": n_perms,
    }


def run_all_tests(report_path: str, n_perms: int = 50000, seed: int = 42) -> dict:
    """Run all permutation tests for all models.

    Returns a dict with per-model results for both ordinal and magnitude tests.
    """
    models, domains, sensitivity_data = load_sensitivity_data(report_path)
    rng = np.random.default_rng(seed)

    results = {"parameters": {"n_permutations": n_perms, "seed": seed,
                               "framings_averaged": CULTURAL_FRAMINGS},
               "models": {}}

    comparisons = [
        ("moral", "physical"),
        ("institutional", "physical"),
        ("moral", "institutional"),
    ]

    for model in models:
        print(f"  {model}...")
        concepts, drifts, labels = compute_concept_drifts(
            sensitivity_data[model], domains, CULTURAL_FRAMINGS
        )

        model_results = {
            "domain_means": {
                d: round(float(np.mean(drifts[labels == d])), 4)
                for d in ["physical", "institutional", "moral"]
            },
            "ordinal": ordinal_test(drifts, labels, n_perms, rng),
            "magnitude": {},
        }

        for high, low in comparisons:
            key = f"{high}_gt_{low}"
            model_results["magnitude"][key] = magnitude_test(
                drifts, labels, high, low, n_perms, rng
            )

        results["models"][model] = model_results

    return results


def print_summary(results: dict):
    """Print a human-readable summary of test results."""
    print()
    print("=" * 75)
    print("PERMUTATION TEST RESULTS")
    print("=" * 75)

    # Ordinal test summary
    print("\n1. ORDINAL TEST (pre-registered)")
    print(f"   {'Model':<20} {'P<I<M p':>10} {'Note'}")
    print("   " + "-" * 55)
    for model, mr in results["models"].items():
        p = mr["ordinal"]["p_value"]
        print(f"   {model:<20} {p:>10.4f}   ~16.7% (structurally flat)")

    # Magnitude test summary
    comparisons = [
        ("moral", "physical", "a"),
        ("institutional", "physical", "b"),
        ("moral", "institutional", "c"),
    ]
    for high, low, letter in comparisons:
        key = f"{high}_gt_{low}"
        label = f"{high.capitalize()} > {low.capitalize()}"
        print(f"\n2{letter}. MAGNITUDE TEST: {label}")
        print(f"   {'Model':<20} {'Diff':>8} {'p-value':>10} {'Sig':>5}")
        print("   " + "-" * 48)
        for model, mr in results["models"].items():
            t = mr["magnitude"][key]
            sig = "***" if t["p_value"] < 0.001 else (
                  "**" if t["p_value"] < 0.01 else (
                  "*" if t["p_value"] < 0.05 else ""))
            print(f"   {model:<20} {t['observed_difference']:>8.3f} "
                  f"{t['p_value']:>10.4f} {sig:>5}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run permutation tests on RCP report data."
    )
    parser.add_argument("report", help="Path to report-lite.json or report.json")
    parser.add_argument("--output", "-o", default=None,
                        help="Write JSON results to this file")
    parser.add_argument("--permutations", "-n", type=int, default=50000,
                        help="Number of permutations (default: 50000)")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed (default: 42)")
    args = parser.parse_args()

    print(f"Running permutation tests ({args.permutations:,} shuffles)...")
    results = run_all_tests(args.report, n_perms=args.permutations, seed=args.seed)

    # Write JSON first so results are saved even if printing fails
    if args.output:
        with open(args.output, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nResults written to {args.output}")

    print_summary(results)
