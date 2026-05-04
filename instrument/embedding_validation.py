#!/usr/bin/env python3
"""
embedding_validation.py - Concept inventory validation via embedding analysis.

Validates the RCP V2 concept inventory by checking that the 54 concepts
cluster cleanly into their assigned domains (physical, institutional, moral)
in embedding space. Uses two sentence-transformer models for cross-validation.

This script was run once during concept inventory development. The output
(embedding_validation.json) is committed to the repository. Re-running
requires a Hugging Face API connection.

Requirements: pip install huggingface_hub scikit-learn numpy

Usage:
    python embedding_validation.py
    python embedding_validation.py --output results.json
    python embedding_validation.py --test
"""

import argparse
import json
import sys

import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import silhouette_samples, silhouette_score


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CONCEPTS = {
    "physical": [
        "acceleration", "amplitude", "buoyancy", "conduction", "convection",
        "crystallization", "density", "diffusion", "elasticity", "erosion",
        "evaporation", "friction", "magnetism", "oscillation", "refraction",
        "sublimation", "turbulence", "viscosity",
    ],
    "institutional": [
        "arbitration", "bureaucracy", "census", "citizenship", "constitution",
        "federation", "jurisdiction", "legislation", "naturalization", "parliament",
        "prosecution", "ratification", "referendum", "regulation", "republic",
        "sovereignty", "tariff", "taxation",
    ],
    "moral": [
        "altruism", "compassion", "conscience", "courage", "devotion",
        "dignity", "forgiveness", "generosity", "gratitude", "honesty",
        "honor", "humility", "integrity", "loyalty", "obedience",
        "sacrifice", "tolerance", "wisdom",
    ],
}

MODELS = [
    "sentence-transformers/all-MiniLM-L6-v2",
    "sentence-transformers/all-mpnet-base-v2",
]


# ---------------------------------------------------------------------------
# Embedding retrieval
# ---------------------------------------------------------------------------

def get_embeddings(texts, model_id, client):
    """Fetch embeddings from Hugging Face Inference API."""
    results = client.feature_extraction(texts, model=model_id)
    return np.array(results)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_model(embeddings, domain_labels, domain_names):
    """Run cluster validation on one set of embeddings.

    Returns dict with silhouette score, cluster accuracy, and per-concept details.
    """
    sil_samples = silhouette_samples(embeddings, domain_labels, metric="cosine")
    sil_overall = silhouette_score(embeddings, domain_labels, metric="cosine")

    clustering = AgglomerativeClustering(n_clusters=3, linkage="ward")
    cluster_labels = clustering.fit_predict(embeddings)

    # Map each cluster to its majority domain
    cluster_to_domain = {}
    for cl in range(3):
        mask = cluster_labels == cl
        counts = {}
        for i in range(len(domain_names)):
            if mask[i]:
                counts[domain_names[i]] = counts.get(domain_names[i], 0) + 1
        cluster_to_domain[cl] = max(counts, key=counts.get)

    correct = 0
    misplaced = []
    all_concepts_flat = []
    for domain in CONCEPTS:
        all_concepts_flat.extend(CONCEPTS[domain])

    for i, concept in enumerate(all_concepts_flat):
        predicted = cluster_to_domain[cluster_labels[i]]
        actual = domain_names[i]
        if predicted == actual:
            correct += 1
        else:
            misplaced.append({
                "concept": concept,
                "true_domain": actual,
                "clustered_with": predicted,
            })

    accuracy = correct / len(all_concepts_flat)
    negative_count = sum(1 for s in sil_samples if s < 0)

    concept_scores = [
        {
            "concept": all_concepts_flat[i],
            "domain": domain_names[i],
            "silhouette": round(float(sil_samples[i]), 4),
        }
        for i in range(len(all_concepts_flat))
    ]

    return {
        "overall_silhouette": round(float(sil_overall), 4),
        "cluster_accuracy": round(accuracy, 4),
        "cluster_accuracy_fraction": f"{correct}/{len(all_concepts_flat)}",
        "negative_silhouette_count": negative_count,
        "all_positive": negative_count == 0,
        "misplaced_concepts": misplaced,
        "per_concept": concept_scores,
    }


def run_validation(output_path):
    """Run embedding validation across all models and write results."""
    from huggingface_hub import InferenceClient
    client = InferenceClient()

    all_concepts = []
    domain_labels = []
    domain_names = []
    for domain, concepts in CONCEPTS.items():
        for c in concepts:
            all_concepts.append(c)
            domain_labels.append(list(CONCEPTS.keys()).index(domain))
            domain_names.append(domain)

    results = {"concepts": all_concepts, "domains": domain_names, "models": {}}

    for model_id in MODELS:
        short_name = model_id.split("/")[-1]
        print(f"\n{short_name}:")
        print(f"  Fetching embeddings for {len(all_concepts)} concepts...")
        embeddings = get_embeddings(all_concepts, model_id, client)
        print(f"  Embedding shape: {embeddings.shape}")

        model_results = validate_model(embeddings, domain_labels, domain_names)
        results["models"][short_name] = model_results

        print(f"  Overall silhouette: {model_results['overall_silhouette']:.4f}")
        print(f"  Cluster accuracy: {model_results['cluster_accuracy_fraction']} "
              f"({model_results['cluster_accuracy'] * 100:.1f}%)")
        print(f"  Negative silhouette: {model_results['negative_silhouette_count']}")
        print(f"  All positive: {model_results['all_positive']}")
        if model_results["misplaced_concepts"]:
            names = [m["concept"] for m in model_results["misplaced_concepts"]]
            print(f"  Misplaced: {names}")

        for domain in CONCEPTS:
            dsils = [
                s["silhouette"] for s in model_results["per_concept"]
                if s["domain"] == domain
            ]
            print(f"  {domain}: mean={np.mean(dsils):.4f}, min={np.min(dsils):.4f}")

    # Summary
    print(f"\n{'=' * 60}")
    for mn, mr in results["models"].items():
        print(f"{mn}: sil={mr['overall_silhouette']}, "
              f"acc={mr['cluster_accuracy_fraction']}, "
              f"all_positive={mr['all_positive']}")

    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults written to {output_path}")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def run_tests():
    """Verify validation logic with synthetic embeddings."""
    passed = failed = 0

    def check(name, got, expected):
        nonlocal passed, failed
        if got == expected:
            passed += 1
        else:
            failed += 1
            print(f"  FAIL: {name}: expected {expected!r}, got {got!r}")

    print("Running unit tests...\n")

    # Build clean synthetic embeddings: 3 tight clusters
    rng = np.random.default_rng(42)
    n_per = 6
    embeddings = np.vstack([
        rng.normal(loc=[1, 0, 0], scale=0.1, size=(n_per, 3)),
        rng.normal(loc=[0, 1, 0], scale=0.1, size=(n_per, 3)),
        rng.normal(loc=[0, 0, 1], scale=0.1, size=(n_per, 3)),
    ])
    domain_labels = [0] * n_per + [1] * n_per + [2] * n_per
    domain_names = (["physical"] * n_per +
                    ["institutional"] * n_per +
                    ["moral"] * n_per)

    result = validate_model(embeddings, domain_labels, domain_names)
    check("perfect clusters give 100% accuracy", result["cluster_accuracy"], 1.0)
    check("no misplaced concepts", len(result["misplaced_concepts"]), 0)
    check("positive silhouette", result["overall_silhouette"] > 0.5, True)
    check("all positive silhouettes", result["all_positive"], True)

    print(f"\n{passed} passed, {failed} failed")
    return failed == 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Validate RCP V2 concept inventory via embedding clustering."
    )
    parser.add_argument(
        "--output", "-o", default="embedding_validation.json",
        help="Output path for results JSON (default: embedding_validation.json)",
    )
    parser.add_argument("--test", action="store_true", help="Run unit tests")
    args = parser.parse_args()

    if args.test:
        sys.exit(0 if run_tests() else 1)

    run_validation(args.output)


if __name__ == "__main__":
    main()
