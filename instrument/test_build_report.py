#!/usr/bin/env python3
"""
test_build_report.py - Tests for RCP analysis functions.

Tests core analysis logic with known inputs and expected outputs.
Run with pytest or directly:

    pytest test_build_report.py -v
    python test_build_report.py
"""

import math
import numpy as np

from build_report import (
    safe_mean,
    build_similarity_matrix,
    get_rating_vector,
    cluster_accuracy,
    procrustes_distance,
)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_safe_mean():
    """safe_mean returns average or None for empty input."""
    assert safe_mean([1, 2, 3]) == 2.0, "mean of [1,2,3] should be 2.0"
    assert safe_mean([]) is None, "mean of [] should be None"
    assert safe_mean([5]) == 5.0, "mean of [5] should be 5.0"
    assert abs(safe_mean([1, 2, 3, 4]) - 2.5) < 1e-9, "mean of [1,2,3,4] should be 2.5"





def test_build_similarity_matrix():
    """Matrix constructed correctly from parsed ratings, respecting framing."""
    concepts = ["a", "b", "c"]
    parsed = [
        {"frame": "unframed", "rating": 5, "concept_a": "a", "concept_b": "b"},
        {"frame": "unframed", "rating": 2, "concept_a": "a", "concept_b": "c"},
        {"frame": "unframed", "rating": 3, "concept_a": "b", "concept_b": "c"},
        {"frame": "framed", "rating": 7, "concept_a": "a", "concept_b": "b"},
    ]

    matrix = build_similarity_matrix(parsed, concepts, "unframed")

    assert matrix.shape == (3, 3), f"expected (3,3), got {matrix.shape}"
    assert matrix[0, 0] == 7.0, "diagonal should be 7.0"
    assert matrix[0, 1] == 5.0, "a-b should be 5.0"
    assert matrix[1, 0] == 5.0, "b-a should be 5.0 (symmetric)"
    assert matrix[0, 2] == 2.0, "a-c should be 2.0"
    assert matrix[1, 2] == 3.0, "b-c should be 3.0"

    # Framed data should not leak into unframed matrix
    assert matrix[0, 1] == 5.0, "framed rating (7) should not appear in unframed matrix"

    # Framed extraction
    matrix_f = build_similarity_matrix(parsed, concepts, "framed")
    assert matrix_f[0, 1] == 7.0, "a-b under framed should be 7.0"


def test_get_rating_vector():
    """Rating vectors keyed by probe_id, filtering by framing and None ratings."""
    parsed = [
        {"frame": "unframed", "rating": 5, "probe_id": "p1"},
        {"frame": "unframed", "rating": 3, "probe_id": "p2"},
        {"frame": "framed", "rating": 7, "probe_id": "p1"},
        {"frame": "unframed", "rating": None, "probe_id": "p3"},
    ]

    vec = get_rating_vector(parsed, "unframed")
    assert vec == {"p1": 5, "p2": 3}, "None ratings should be excluded"

    vec_f = get_rating_vector(parsed, "framed")
    assert vec_f == {"p1": 7}, "should contain only framed entries"

    vec_empty = get_rating_vector(parsed, "nonsense")
    assert vec_empty == {}, "missing framing should return empty dict"


def test_cluster_accuracy():
    """Cluster-to-domain mapping finds best permutation. O(k!) for k=3."""
    # Perfect clustering
    true_domains = ["a", "a", "b", "b", "c", "c"]
    cluster_labels = [1, 1, 2, 2, 3, 3]
    acc, mapping = cluster_accuracy(true_domains, cluster_labels)
    assert acc == 1.0, f"perfect clustering should give 1.0, got {acc}"

    # One mistake
    cluster_labels_bad = [1, 2, 2, 2, 3, 3]
    acc_bad, _ = cluster_accuracy(true_domains, cluster_labels_bad)
    assert abs(acc_bad - 5 / 6) < 1e-9, f"one mistake should give 5/6, got {acc_bad}"

    # Two mistakes
    cluster_labels_two = [1, 2, 2, 1, 3, 3]
    acc_two, _ = cluster_accuracy(true_domains, cluster_labels_two)
    assert abs(acc_two - 4 / 6) < 1e-9, f"two mistakes should give 4/6, got {acc_two}"


def test_procrustes_distance():
    """Procrustes: identical=0, scaled=small, random=larger."""
    m = np.array([[7, 3, 1], [3, 7, 2], [1, 2, 7]], dtype=float)

    # Identical matrices
    result = procrustes_distance(m, m)
    assert result["raw_residual"] < 0.01, "identical matrices should have ~0 residual"
    assert result["normalized_distance"] < 0.01, "identical matrices should have ~0 distance"

    # Scaled matrix: structure preserved, values changed
    m_scaled = m.copy()
    m_scaled[m_scaled != 7] *= 2
    result_scaled = procrustes_distance(m, m_scaled)
    assert result_scaled["normalized_distance"] > 0.01, "scaled matrix should differ"
    assert result_scaled["normalized_distance"] < 0.5, "scaled matrix should be related"

    # Random matrix: higher distance than scaled
    rng = np.random.default_rng(42)
    m_random = rng.random((3, 3)) * 6 + 1
    m_random = (m_random + m_random.T) / 2
    np.fill_diagonal(m_random, 7)
    result_random = procrustes_distance(m, m_random)
    assert result_random["normalized_distance"] > result["normalized_distance"], \
        "random matrix should have greater distance than identical"


# ---------------------------------------------------------------------------
# Direct execution (fallback for environments without pytest)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    tests = [
        test_safe_mean,
        test_build_similarity_matrix,
        test_get_rating_vector,
        test_cluster_accuracy,
        test_procrustes_distance,
    ]

    passed = failed = 0
    for test in tests:
        try:
            test()
            passed += 1
            print(f"  PASS: {test.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL: {test.__name__}: {e}")

    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
