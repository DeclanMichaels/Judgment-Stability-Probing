#!/usr/bin/env python3
"""
factor_analysis.py - PCA on unframed similarity matrices.

Pre-registered analysis: principal component analysis on each model's
unframed similarity matrix. Reports eigenvalues, variance explained by
the first three components, and factor loadings per concept. Concepts
from the same domain should load on the same component if the instrument
measures three distinct constructs.

Reads similarity matrices from the cluster_validation section of
report-lite.json (or report.json).

Usage:
    python factor_analysis.py path/to/report-lite.json
    python factor_analysis.py path/to/report-lite.json --output pca_results.json
"""

import argparse
import json

import numpy as np


def load_matrices(report_path: str) -> dict:
    """Load unframed similarity matrices from report.

    Returns dict[model] -> {matrix, concepts, domains}.
    """
    with open(report_path) as f:
        report = json.load(f)

    cluster = None
    for section in report["sections"]:
        if section.get("type") == "cluster_validation":
            cluster = section
            break

    if cluster is None:
        raise ValueError(f"No cluster_validation section found in {report_path}")

    result = {}
    for model in cluster["models"]:
        d = cluster["data"][model]
        result[model] = {
            "matrix": np.array(d["similarity_matrix"], dtype=float),
            "concepts": d["reordered_concepts"],
            "domains": d["reordered_domains"],
        }
    return result


def run_pca(matrix: np.ndarray, concepts: list, domains: list) -> dict:
    """Run PCA on a similarity matrix.

    The similarity matrix is treated as a correlation-like matrix:
    each row is a concept's similarity profile across all other concepts.
    PCA extracts the principal axes of variation in these profiles.
    """
    centered = matrix - matrix.mean(axis=1, keepdims=True)
    U, S, Vt = np.linalg.svd(centered, full_matrices=False)

    eigenvalues = (S ** 2) / (len(concepts) - 1)
    total_var = eigenvalues.sum()
    var_explained = eigenvalues / total_var

    n_components = min(3, len(S))
    loadings = U[:, :n_components] * S[:n_components]
    dominant = np.argmax(np.abs(loadings), axis=1)

    domain_set = sorted(set(domains))
    component_domain_map = {}
    for comp in range(n_components):
        domain_means = {}
        for domain in domain_set:
            mask = [i for i, d in enumerate(domains) if d == domain]
            domain_means[domain] = float(np.mean(np.abs(loadings[mask, comp])))
        best_domain = max(domain_means, key=domain_means.get)
        component_domain_map[f"PC{comp+1}"] = {
            "primary_domain": best_domain,
            "domain_mean_loadings": {d: round(v, 4) for d, v in domain_means.items()},
        }

    comp_to_domain = {
        comp: info["primary_domain"]
        for comp, info in component_domain_map.items()
    }
    assigned_domains = set(comp_to_domain.values())
    if len(assigned_domains) == 3:
        domain_to_comp = {v: int(k[2:]) - 1 for k, v in comp_to_domain.items()}
        aligned = sum(
            1 for i, d in enumerate(domains)
            if dominant[i] == domain_to_comp.get(d, -1)
        )
        alignment_rate = aligned / len(concepts)
    else:
        alignment_rate = None

    concept_loadings = []
    for i, concept in enumerate(concepts):
        entry = {
            "concept": concept,
            "domain": domains[i],
            "dominant_component": f"PC{dominant[i]+1}",
        }
        for comp in range(n_components):
            entry[f"PC{comp+1}"] = round(float(loadings[i, comp]), 4)
        concept_loadings.append(entry)

    return {
        "eigenvalues": [round(float(e), 4) for e in eigenvalues[:10]],
        "variance_explained": [round(float(v), 4) for v in var_explained[:10]],
        "cumulative_variance": [
            round(float(np.sum(var_explained[:i+1])), 4)
            for i in range(min(10, len(var_explained)))
        ],
        "n_components_90pct": int(np.searchsorted(
            np.cumsum(var_explained), 0.9
        ) + 1),
        "component_domain_map": component_domain_map,
        "alignment_rate": round(alignment_rate, 4) if alignment_rate is not None else None,
        "concept_loadings": concept_loadings,
    }


def print_summary(results: dict):
    """Print human-readable PCA summary."""
    print()
    print("=" * 75)
    print("PCA / FACTOR ANALYSIS RESULTS")
    print("=" * 75)

    for model, mr in results["models"].items():
        print(f"\n--- {model} ---")
        ve = mr["variance_explained"]
        cv = mr["cumulative_variance"]
        print(f"  First 3 components: {ve[0]:.1%}, {ve[1]:.1%}, {ve[2]:.1%} "
              f"(cumulative: {cv[2]:.1%})")
        print(f"  Components for 90% variance: {mr['n_components_90pct']}")

        if mr["alignment_rate"] is not None:
            print(f"  Domain-component alignment: {mr['alignment_rate']:.1%}")
        else:
            print(f"  Domain-component alignment: N/A (not all domains represented)")

        print(f"  Component-domain mapping:")
        for comp, info in mr["component_domain_map"].items():
            loads = info["domain_mean_loadings"]
            load_str = ", ".join(f"{d}={v:.3f}" for d, v in loads.items())
            print(f"    {comp} -> {info['primary_domain']} ({load_str})")

        # Build domain-to-expected-component map from component_domain_map.
        # Only works when all three domains have a unique component.
        assigned = set(
            info["primary_domain"]
            for info in mr["component_domain_map"].values()
        )
        if len(assigned) == 3:
            domain_to_comp = {}
            for comp_name, info in mr["component_domain_map"].items():
                domain_to_comp[info["primary_domain"]] = comp_name
            misaligned = [
                c for c in mr["concept_loadings"]
                if c["dominant_component"] != domain_to_comp.get(c["domain"])
            ]
        else:
            # When domains share components, report concepts whose
            # dominant component's primary domain differs from their own.
            comp_primary = {
                k: v["primary_domain"]
                for k, v in mr["component_domain_map"].items()
            }
            misaligned = [
                c for c in mr["concept_loadings"]
                if comp_primary.get(c["dominant_component"]) != c["domain"]
            ]

        if misaligned:
            print(f"  Misaligned concepts ({len(misaligned)}):")
            for c in misaligned:
                print(f"    {c['concept']} ({c['domain']}) -> {c['dominant_component']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run PCA on unframed similarity matrices."
    )
    parser.add_argument("report", help="Path to report-lite.json or report.json")
    parser.add_argument("--output", "-o", default=None,
                        help="Write JSON results to this file")
    args = parser.parse_args()

    print("Loading similarity matrices...")
    matrices = load_matrices(args.report)

    results = {"models": {}}
    for model, data in matrices.items():
        print(f"  {model}...")
        results["models"][model] = run_pca(
            data["matrix"], data["concepts"], data["domains"]
        )

    # Write JSON first so results are saved even if printing fails
    if args.output:
        with open(args.output, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nResults written to {args.output}")

    print_summary(results)
