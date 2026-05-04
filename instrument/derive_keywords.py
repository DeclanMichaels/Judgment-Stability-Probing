#!/usr/bin/env python3
"""
derive_keywords.py - Empirically derive framing keyword lists from differential word frequency.

Computes log-odds ratios for every word in framed explanations vs unframed
explanations. Words statistically overrepresented under a framing condition
become that condition's keyword list. The method is symmetric across all
framings: the same procedure produces geometric, glorbic, and cultural lists.

Derivation uses temperature 0 data. Application (in build_report.py) uses
temperature 0.7 data. This avoids circularity.

Usage:
    python derive_keywords.py                               # default: explanations.json
    python derive_keywords.py --input explanations.json      # explicit input
    python derive_keywords.py --min-log-odds 2.0             # adjust threshold
    python derive_keywords.py --test                         # run unit tests

Outputs:
    derived_keywords.json    Machine-readable keyword lists with statistics
    stdout                   Human-readable summary

The output JSON is consumed by build_report.py for keyword incorporation detection.
"""

import argparse
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_MIN_LOG_ODDS = 3.0   # Words must be at least e^3 (~20x) more frequent
DEFAULT_MIN_COUNT = 5        # Minimum occurrences under the framing condition
STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can", "need",
    "it", "its", "this", "that", "these", "those", "they", "them", "their",
    "he", "she", "his", "her", "we", "our", "you", "your", "i", "my", "me",
    "not", "no", "nor", "so", "if", "then", "than", "too", "very", "just",
    "about", "above", "after", "again", "all", "also", "am", "any", "because",
    "before", "between", "both", "each", "few", "more", "most", "other",
    "over", "own", "same", "some", "such", "through", "under", "until",
    "up", "when", "where", "which", "while", "who", "whom", "why", "how",
    "here", "there", "what", "out", "into", "during", "only", "once",
}

# Concept names to exclude (they appear in prompts, not framing incorporation)
CONCEPT_NAMES = {
    "acceleration", "amplitude", "buoyancy", "conduction", "convection",
    "crystallization", "density", "diffusion", "elasticity", "erosion",
    "evaporation", "friction", "magnetism", "oscillation", "refraction",
    "sublimation", "turbulence", "viscosity",
    "arbitration", "bureaucracy", "census", "citizenship", "constitution",
    "federation", "jurisdiction", "legislation", "naturalization", "parliament",
    "prosecution", "ratification", "referendum", "regulation", "republic",
    "sovereignty", "tariff", "taxation",
    "altruism", "compassion", "conscience", "courage", "devotion", "dignity",
    "forgiveness", "generosity", "gratitude", "honesty", "honor", "humility",
    "integrity", "loyalty", "obedience", "sacrifice", "tolerance", "wisdom",
}


# ---------------------------------------------------------------------------
# Tokenization
# ---------------------------------------------------------------------------

def tokenize(text):
    """Simple whitespace + punctuation tokenizer. Returns lowercase tokens."""
    if not text:
        return []
    # Split on non-alphanumeric, keep tokens of length >= 2
    tokens = re.findall(r'[a-z]{2,}', text.lower())
    return [t for t in tokens if t not in STOPWORDS and t not in CONCEPT_NAMES]


# ---------------------------------------------------------------------------
# Differential frequency analysis
# ---------------------------------------------------------------------------

def compute_word_frequencies(explanations, frame):
    """Count word frequencies across all explanations for a given frame."""
    counter = Counter()
    n_docs = 0
    for e in explanations:
        if e["frame"] == frame:
            tokens = tokenize(e.get("explanation", ""))
            counter.update(set(tokens))  # document frequency (presence, not count)
            n_docs += 1
    return counter, n_docs


def compute_log_odds(freq_target, n_target, freq_baseline, n_baseline, smoothing=0.5):
    """Compute log-odds ratio with Laplace smoothing.

    Returns log((freq_target + smoothing) / (n_target + smoothing)) -
            log((freq_baseline + smoothing) / (n_baseline + smoothing))
    """
    p_target = (freq_target + smoothing) / (n_target + 2 * smoothing)
    p_baseline = (freq_baseline + smoothing) / (n_baseline + 2 * smoothing)
    if p_target <= 0 or p_baseline <= 0:
        return 0.0
    return math.log(p_target / p_baseline)


def derive_keywords_for_frame(explanations, frame, min_log_odds, min_count):
    """Derive keyword list for one framing condition vs unframed baseline."""
    freq_frame, n_frame = compute_word_frequencies(explanations, frame)
    freq_unframed, n_unframed = compute_word_frequencies(explanations, "unframed")

    results = []
    for word, count in freq_frame.items():
        if count < min_count:
            continue
        baseline_count = freq_unframed.get(word, 0)
        log_odds = compute_log_odds(count, n_frame, baseline_count, n_unframed)
        if log_odds >= min_log_odds:
            results.append({
                "word": word,
                "log_odds": round(log_odds, 3),
                "frame_doc_freq": count,
                "frame_doc_pct": round(100 * count / max(n_frame, 1), 1),
                "baseline_doc_freq": baseline_count,
                "baseline_doc_pct": round(100 * baseline_count / max(n_unframed, 1), 1),
            })

    results.sort(key=lambda x: x["log_odds"], reverse=True)
    return results, n_frame, n_unframed


def derive_all_keywords(explanations, min_log_odds, min_count):
    """Derive keyword lists for all framing conditions."""
    frames = sorted(set(e["frame"] for e in explanations) - {"unframed"})
    output = {
        "method": "differential_document_frequency",
        "description": (
            "Keywords derived by computing log-odds ratio of document frequency "
            "under each framing condition vs unframed baseline. Words appearing "
            f"at least {min_count} times with log-odds >= {min_log_odds} "
            f"(~{math.exp(min_log_odds):.1f}x overrepresentation) are included."
        ),
        "parameters": {
            "min_log_odds": min_log_odds,
            "min_count": min_count,
            "smoothing": 0.5,
        },
        "framings": {},
    }

    for frame in frames:
        results, n_frame, n_unframed = derive_keywords_for_frame(
            explanations, frame, min_log_odds, min_count
        )
        output["framings"][frame] = {
            "n_explanations": n_frame,
            "n_baseline": n_unframed,
            "n_keywords": len(results),
            "keywords": [r["word"] for r in results],
            "details": results,
        }

    return output


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------

def print_results(output):
    """Print human-readable summary."""
    print(f"\n{'=' * 80}")
    print(f"EMPIRICALLY DERIVED KEYWORD LISTS")
    print(f"{'=' * 80}")
    print(f"Method: {output['description']}")
    print(f"Parameters: min_log_odds={output['parameters']['min_log_odds']}, "
          f"min_count={output['parameters']['min_count']}")

    for frame, data in sorted(output["framings"].items()):
        print(f"\n{'─' * 60}")
        print(f"{frame} ({data['n_keywords']} keywords, "
              f"n_frame={data['n_explanations']}, n_baseline={data['n_baseline']})")
        print(f"{'─' * 60}")
        if not data["details"]:
            print("  (no keywords meet threshold)")
            continue
        print(f"  {'Word':<25} {'LogOdds':>8} {'Frame%':>8} {'Base%':>8} {'Ratio':>8}")
        for d in data["details"]:
            base_pct = d["baseline_doc_pct"]
            ratio = f"{d['frame_doc_pct'] / max(base_pct, 0.01):.1f}x" if base_pct > 0 else "inf"
            print(f"  {d['word']:<25} {d['log_odds']:>8.2f} {d['frame_doc_pct']:>7.1f}% "
                  f"{base_pct:>7.1f}% {ratio:>8}")

    # Summary comparison
    print(f"\n{'=' * 80}")
    print(f"KEYWORD COUNT SUMMARY")
    print(f"{'=' * 80}")
    for frame, data in sorted(output["framings"].items()):
        print(f"  {frame:<20} {data['n_keywords']:>3} keywords")


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------

def run_tests():
    passed = failed = 0
    def check(name, got, expected):
        nonlocal passed, failed
        if got == expected: passed += 1
        else: failed += 1; print(f"  FAIL: {name}: expected {expected!r}, got {got!r}")

    print("Running unit tests...\n")

    # tokenize
    check("basic tokenize", tokenize("Hello World test"), ["hello", "world", "test"])
    check("strips stopwords", tokenize("the cat is on the mat"), ["cat", "mat"])
    check("strips concept names", tokenize("acceleration and buoyancy relate"), ["relate"])
    check("strips short tokens", tokenize("a I x to be"), [])
    check("handles None", tokenize(None), [])
    check("handles empty", tokenize(""), [])
    check("punctuation split", tokenize("angular, symmetry; proportion."), ["angular", "symmetry", "proportion"])

    # compute_log_odds
    # If word appears in 50% of target docs and 5% of baseline docs
    lo = compute_log_odds(50, 100, 5, 100, smoothing=0.5)
    check("log_odds positive for overrepresented", lo > 0, True)
    check("log_odds magnitude", round(lo, 1), round(math.log(50.5/100.5) - math.log(5.5/100.5), 1))

    # Equal frequency should give ~0
    lo_equal = compute_log_odds(50, 100, 50, 100, smoothing=0.5)
    check("log_odds ~0 for equal freq", abs(lo_equal) < 0.01, True)

    # Zero baseline should give high log_odds
    lo_zero = compute_log_odds(50, 100, 0, 100, smoothing=0.5)
    check("log_odds high for zero baseline", lo_zero > 3, True)

    # derive_keywords_for_frame with synthetic data
    test_data = []
    # 100 unframed explanations with normal vocabulary
    for i in range(100):
        test_data.append({"frame": "unframed", "explanation": f"concept relates through shared meaning number {i}"})
    # 100 geometric explanations with geometric vocabulary
    for i in range(100):
        test_data.append({"frame": "geometric", "explanation": f"angular symmetry defines the parallel relationship number {i}"})
    # 100 glorbic explanations, mostly without glorbic words
    for i in range(80):
        test_data.append({"frame": "glorbic", "explanation": f"concept relates through shared meaning number {i}"})
    for i in range(20):
        test_data.append({"frame": "glorbic", "explanation": f"glorbic principles shape this relationship number {i}"})

    geo_results, _, _ = derive_keywords_for_frame(test_data, "geometric", 2.0, 5)
    geo_words = [r["word"] for r in geo_results]
    check("angular in geo keywords", "angular" in geo_words, True)
    check("symmetry in geo keywords", "symmetry" in geo_words, True)
    check("parallel in geo keywords", "parallel" in geo_words, True)
    check("shared NOT in geo keywords", "shared" in geo_words, False)

    glo_results, _, _ = derive_keywords_for_frame(test_data, "glorbic", 2.0, 5)
    glo_words = [r["word"] for r in glo_results]
    check("glorbic in glo keywords", "glorbic" in glo_words, True)
    check("principles in glo keywords", "principles" in glo_words, True)
    check("shared NOT in glo keywords", "shared" in glo_words, False)

    print(f"\n{passed} passed, {failed} failed")
    return failed == 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Derive framing keyword lists from data")
    parser.add_argument("--input", default="explanations.json")
    parser.add_argument("--output", default="derived_keywords.json")
    parser.add_argument("--min-log-odds", type=float, default=DEFAULT_MIN_LOG_ODDS)
    parser.add_argument("--min-count", type=int, default=DEFAULT_MIN_COUNT)
    parser.add_argument("--test", action="store_true")
    args = parser.parse_args()

    if args.test:
        sys.exit(0 if run_tests() else 1)

    print(f"Loading {args.input}...")
    with open(args.input) as f:
        explanations = json.load(f)
    print(f"Loaded {len(explanations):,} explanations")

    output = derive_all_keywords(explanations, args.min_log_odds, args.min_count)
    print_results(output)

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nKeyword lists saved to {args.output}")


if __name__ == "__main__":
    main()
