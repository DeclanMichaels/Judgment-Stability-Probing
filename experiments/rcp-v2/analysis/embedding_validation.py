#!/usr/bin/env python3
"""
Embedding validation for RCP V2 concept inventory.
Uses huggingface_hub InferenceClient -- no torch, no sentence-transformers.

Requirements: pip install huggingface_hub scikit-learn numpy
"""

import json
import numpy as np
from sklearn.metrics import silhouette_samples, silhouette_score
from sklearn.cluster import AgglomerativeClustering
from huggingface_hub import InferenceClient

client = InferenceClient()

CONCEPTS = {
    "physical": [
        "acceleration", "amplitude", "buoyancy", "conduction", "convection",
        "crystallization", "density", "diffusion", "elasticity", "erosion",
        "evaporation", "friction", "magnetism", "oscillation", "refraction",
        "sublimation", "turbulence", "viscosity"
    ],
    "institutional": [
        "arbitration", "bureaucracy", "census", "citizenship", "constitution",
        "federation", "jurisdiction", "legislation", "naturalization", "parliament",
        "prosecution", "ratification", "referendum", "regulation", "republic",
        "sovereignty", "tariff", "taxation"
    ],
    "moral": [
        "altruism", "compassion", "conscience", "courage", "devotion",
        "dignity", "forgiveness", "generosity", "gratitude", "honesty",
        "honor", "humility", "integrity", "loyalty", "obedience",
        "sacrifice", "tolerance", "wisdom"
    ]
}

MODELS = [
    "sentence-transformers/all-MiniLM-L6-v2",
    "sentence-transformers/all-mpnet-base-v2"
]

def get_embeddings(texts, model_id):
    results = client.feature_extraction(texts, model=model_id)
    return np.array(results)

def run_validation():
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
        embeddings = get_embeddings(all_concepts, model_id)
        print(f"  Embedding shape: {embeddings.shape}")

        sil_samples = silhouette_samples(embeddings, domain_labels, metric="cosine")
        sil_overall = silhouette_score(embeddings, domain_labels, metric="cosine")

        clustering = AgglomerativeClustering(n_clusters=3, linkage="ward")
        cluster_labels = clustering.fit_predict(embeddings)

        cluster_to_domain = {}
        for cl in range(3):
            mask = cluster_labels == cl
            counts = {}
            for i in range(len(mask)):
                if mask[i]:
                    counts[domain_names[i]] = counts.get(domain_names[i], 0) + 1
            cluster_to_domain[cl] = max(counts, key=counts.get)

        correct = 0
        misplaced = []
        for i, c in enumerate(all_concepts):
            predicted = cluster_to_domain[cluster_labels[i]]
            actual = domain_names[i]
            if predicted == actual:
                correct += 1
            else:
                misplaced.append({"concept": c, "true_domain": actual, "clustered_with": predicted})

        accuracy = correct / len(all_concepts)
        negative = sum(1 for s in sil_samples if s < 0)

        concept_scores = []
        for i, c in enumerate(all_concepts):
            concept_scores.append({
                "concept": c,
                "domain": domain_names[i],
                "silhouette": round(float(sil_samples[i]), 4)
            })

        results["models"][short_name] = {
            "overall_silhouette": round(float(sil_overall), 4),
            "cluster_accuracy": round(accuracy, 4),
            "cluster_accuracy_fraction": f"{correct}/{len(all_concepts)}",
            "negative_silhouette_count": negative,
            "all_positive": negative == 0,
            "misplaced_concepts": misplaced,
            "per_concept": concept_scores
        }

        print(f"  Overall silhouette: {sil_overall:.4f}")
        print(f"  Cluster accuracy: {correct}/{len(all_concepts)} ({accuracy*100:.1f}%)")
        print(f"  Negative silhouette: {negative}")
        print(f"  All positive: {negative == 0}")
        if misplaced:
            print(f"  Misplaced: {[m['concept'] for m in misplaced]}")
        for domain in CONCEPTS:
            dsils = [sil_samples[i] for i, d in enumerate(domain_names) if d == domain]
            print(f"  {domain}: mean={np.mean(dsils):.4f}, min={np.min(dsils):.4f}")

    print("\n" + "="*60)
    for mn, mr in results["models"].items():
        print(f"{mn}: sil={mr['overall_silhouette']}, acc={mr['cluster_accuracy_fraction']}, all_positive={mr['all_positive']}")

    with open("embedding_validation.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults written to embedding_validation.json")

if __name__ == "__main__":
    run_validation()
