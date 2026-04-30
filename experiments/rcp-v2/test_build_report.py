"""
test_build_report.py - Unit tests for RCP V2 analysis functions.

Tests core analysis logic with known inputs and expected outputs.
"""

import json
import math
import numpy as np
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from build_report import (
    mean, std,
    build_similarity_matrix,
    get_rating_vector,
    cluster_accuracy,
    procrustes_distance,
)


def test_mean():
    assert mean([1, 2, 3]) == 2.0
    assert mean([]) is None
    assert mean([5]) == 5.0
    assert abs(mean([1, 2, 3, 4]) - 2.5) < 1e-9
    print("  PASS: mean()")


def test_std():
    assert std([]) is None
    assert std([5]) is None
    # std of [2, 4] = sqrt(((2-3)^2 + (4-3)^2) / 2) = sqrt(1) = 1.0
    assert abs(std([2, 4]) - 1.0) < 1e-9
    print("  PASS: std()")


def test_build_similarity_matrix():
    concepts = ["a", "b", "c"]
    parsed = [
        {"frame": "unframed", "rating": 5, "concept_a": "a", "concept_b": "b"},
        {"frame": "unframed", "rating": 2, "concept_a": "a", "concept_b": "c"},
        {"frame": "unframed", "rating": 3, "concept_a": "b", "concept_b": "c"},
        {"frame": "framed", "rating": 7, "concept_a": "a", "concept_b": "b"},
    ]

    matrix = build_similarity_matrix(parsed, concepts, "unframed")
    assert matrix.shape == (3, 3)
    # Diagonal = 7
    assert matrix[0, 0] == 7.0
    # a-b = 5, symmetric
    assert matrix[0, 1] == 5.0
    assert matrix[1, 0] == 5.0
    # a-c = 2
    assert matrix[0, 2] == 2.0
    # b-c = 3
    assert matrix[1, 2] == 3.0
    # Should NOT include the framed rating
    assert matrix[0, 1] == 5.0  # not 7

    # Test framed extraction
    matrix_f = build_similarity_matrix(parsed, concepts, "framed")
    assert matrix_f[0, 1] == 7.0  # a-b under framed
    print("  PASS: build_similarity_matrix()")


def test_get_rating_vector():
    parsed = [
        {"frame": "unframed", "rating": 5, "probe_id": "p1"},
        {"frame": "unframed", "rating": 3, "probe_id": "p2"},
        {"frame": "framed", "rating": 7, "probe_id": "p1"},
        {"frame": "unframed", "rating": None, "probe_id": "p3"},
    ]

    vec = get_rating_vector(parsed, "unframed")
    assert vec == {"p1": 5, "p2": 3}  # p3 excluded (None rating)

    vec_f = get_rating_vector(parsed, "framed")
    assert vec_f == {"p1": 7}

    vec_empty = get_rating_vector(parsed, "nonsense")
    assert vec_empty == {}
    print("  PASS: get_rating_vector()")


def test_cluster_accuracy():
    # Perfect clustering
    true_domains = ["a", "a", "b", "b", "c", "c"]
    cluster_labels = [1, 1, 2, 2, 3, 3]
    acc, mapping = cluster_accuracy(true_domains, cluster_labels)
    assert acc == 1.0

    # One mistake: second item clustered with group 2
    cluster_labels_bad = [1, 2, 2, 2, 3, 3]
    acc_bad, _ = cluster_accuracy(true_domains, cluster_labels_bad)
    assert abs(acc_bad - 5/6) < 1e-9

    # Two mistakes: items 1 and 3 swapped between clusters
    cluster_labels_two = [1, 2, 2, 1, 3, 3]
    acc_two, _ = cluster_accuracy(true_domains, cluster_labels_two)
    assert abs(acc_two - 4/6) < 1e-9
    print("  PASS: cluster_accuracy()")


def test_procrustes_distance():
    # Identical matrices should have zero distance
    m = np.array([[7, 3, 1], [3, 7, 2], [1, 2, 7]], dtype=float)
    result = procrustes_distance(m, m)
    assert result["raw_residual"] < 0.01
    assert result["normalized_distance"] < 0.01

    # Scaled matrix: structure preserved but values changed
    m2 = m.copy()
    m2[m2 != 7] *= 2
    result2 = procrustes_distance(m, m2)
    # Should have nonzero distance (values changed)
    assert result2["normalized_distance"] > 0.01
    # But less than random (structure is related)
    assert result2["normalized_distance"] < 0.5

    # Random matrix should have higher distance
    np.random.seed(42)
    m3 = np.random.rand(3, 3) * 6 + 1
    m3 = (m3 + m3.T) / 2
    np.fill_diagonal(m3, 7)
    result3 = procrustes_distance(m, m3)
    assert result3["normalized_distance"] > result["normalized_distance"]
    print("  PASS: procrustes_distance()")


if __name__ == "__main__":
    print("Running tests...")
    test_mean()
    test_std()
    test_build_similarity_matrix()
    test_get_rating_vector()
    test_cluster_accuracy()
    test_procrustes_distance()
    print("\nAll tests passed.")
