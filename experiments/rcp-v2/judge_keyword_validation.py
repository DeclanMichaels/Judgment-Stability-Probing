#!/usr/bin/env python3
"""
judge_keyword_validation.py - Multi-judge validation of keyword incorporation detection.

Samples explanations from the main RCP experiment's explanations.json, sends each
to a panel of judge models with a binary scoring rubric (incorporates framing
language: yes/no), and compares judge consensus with the keyword-based detector.

Addresses the asymmetric keyword list concern: the keyword detector uses 20+
geometric terms but only 2 glorbic terms. Judge-based scoring detects framing
incorporation holistically, regardless of specific vocabulary.

Usage:
    python judge_keyword_validation.py                          # default 3 judges
    python judge_keyword_validation.py --dry-run                # sample only, no API calls
    python judge_keyword_validation.py --resume                 # resume from partial results
    python judge_keyword_validation.py --analyze-only           # analyze existing results
    python judge_keyword_validation.py --test                   # run unit tests

Reads explanations.json from the same directory (or specify --input).
Reads API keys from EXPERIMENT_PLATFORM_HOME/.env.
"""

import argparse
import json
import os
import random
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import httpx

DEFAULT_JUDGES = [
    "deepseek-ai/DeepSeek-V3.1",
    "mistral-large-latest",
    "command-r-plus-08-2024",
]

SAMPLES_PER_CELL = {
    "unframed": 50, "geometric": 50, "glorbic": 50,
    "individualist": 20, "collectivist": 20, "hierarchical": 20, "egalitarian": 20,
}

SEED = 42

GEOMETRIC_KEYWORDS = [
    "geometric", "geometry", "triangle", "triangular", "circle", "circular",
    "square", "angular", "shape", "symmetr", "polygon", "vertex", "vertices",
    "angle", "parallel", "perpendicular", "dimension", "spatial",
    "proportion", "ratio", "pattern", "tessellat",
]
GLORBIC_KEYWORDS = ["glorbic", "glorb"]
CULTURAL_KEYWORDS = {
    "individualist": ["individual", "autonomy", "self-relian", "independen", "personal freedom"],
    "collectivist": ["collectiv", "commun", "group", "interdependen", "togeth", "harmon"],
    "hierarchical": ["hierarch", "authorit", "rank", "stratif", "subordinat", "obedien"],
    "egalitarian": ["egalitarian", "equal", "equity", "democra", "flat", "non-hierarch"],
}
FRAMING_PREAMBLES = {
    "unframed": None,
    "individualist": "In an individualist society.", "collectivist": "In a collectivist society.",
    "hierarchical": "In a hierarchical society.", "egalitarian": "In an egalitarian society.",
    "geometric": "In a geometric society.", "glorbic": "In a glorbic society.",
}
INTER_JUDGE_DELAY = 0.2

# ---------------------------------------------------------------------------
# Environment loading
# ---------------------------------------------------------------------------

def load_env():
    """Load API keys from EXPERIMENT_PLATFORM_HOME/.env. Aborts if no keys found."""
    platform_home = os.environ.get("EXPERIMENT_PLATFORM_HOME", "")
    if platform_home:
        env_path = Path(platform_home) / ".env"
    else:
        env_path = Path.cwd() / ".env"

    if env_path.exists():
        print(f"Loading .env from {env_path}")
        loaded = 0
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                key, val = key.strip(), val.strip()
                if val:
                    os.environ.setdefault(key, val)
                    loaded += 1
        print(f"  Loaded {loaded} environment variables")
    else:
        print(f"ERROR: No .env found at {env_path}")
        if not platform_home:
            print("  Set EXPERIMENT_PLATFORM_HOME to your platform root directory:")
            print("  export EXPERIMENT_PLATFORM_HOME=/path/to/-Experiment-Platform-")
        sys.exit(1)


def verify_api_keys(judge_models):
    """Verify that API keys exist for all judge vendors. Aborts if any missing."""
    missing = []
    for model in judge_models:
        vendor = detect_vendor(model)
        env_var = VENDOR_KEY_ENVS[vendor]
        key = os.environ.get(env_var, "")
        if key:
            print(f"  {env_var}: set ({key[:8]}...)")
        else:
            print(f"  {env_var}: NOT SET")
            missing.append(env_var)
    if missing:
        print(f"\nERROR: Missing API keys: {', '.join(missing)}")
        sys.exit(1)
    print()

# ---------------------------------------------------------------------------
# Keyword detector
# ---------------------------------------------------------------------------

def keyword_match(explanation, frame):
    text = (explanation or "").lower()
    if frame == "geometric":
        return any(kw in text for kw in GEOMETRIC_KEYWORDS)
    elif frame == "glorbic":
        return any(kw in text for kw in GLORBIC_KEYWORDS)
    elif frame in CULTURAL_KEYWORDS:
        return any(kw in text for kw in CULTURAL_KEYWORDS[frame])
    elif frame == "unframed":
        return False
    return False

# ---------------------------------------------------------------------------
# Judge rubric
# ---------------------------------------------------------------------------

JUDGE_SYSTEM = """You are scoring LLM explanations for a research experiment on framing sensitivity.

The experiment asks models to rate conceptual similarity between pairs of concepts (e.g., "obedience" and "conscience") on a 1-7 scale and explain the relationship in one sentence. Some probes include a framing preamble (e.g., "In a collectivist society." or "In a geometric society.") prepended before the question.

Your task: determine whether the explanation incorporates language derived from the framing preamble.

Respond with ONLY a JSON object, no other text, no markdown fences."""

def build_judge_prompt(item):
    frame = item["frame"]
    preamble = FRAMING_PREAMBLES.get(frame)
    if frame == "unframed" or preamble is None:
        return _build_unframed_prompt(item)
    return _build_framed_prompt(item, preamble)

def _build_framed_prompt(item, preamble):
    frame = item["frame"]
    if frame == "geometric":
        examples = ("Examples of incorporation:\n"
            "- Using words like angular, symmetry, parallel, proportion, spatial, shape\n"
            "- Geometric metaphors for moral or institutional concepts\n"
            "- Spatial reasoning vocabulary applied to non-spatial relationships")
    elif frame == "glorbic":
        examples = ("Examples of incorporation:\n"
            "- Using the word \"glorbic\" or invented terms derived from it\n"
            "- Fabricated vocabulary or concepts attributed to the framing\n"
            "- Any language that treats \"glorbic\" as having a specific meaning")
    elif frame in CULTURAL_KEYWORDS:
        examples = ("Examples of incorporation:\n"
            f"- Framing the relationship in terms specific to a {frame} society\n"
            f"- Using the word \"{frame}\" or its derivatives in the explanation\n"
            f"- Reasoning that draws on {frame} cultural values or structures")
    else:
        examples = ""
    non_examples = ("Examples of non-incorporation:\n"
        "- A straightforward explanation of the concept pair that ignores the preamble\n"
        "- Using words that happen to overlap with the framing but in their standard "
        "meaning (e.g., \"proportion\" in a math context under geometric framing)")
    return (f"## Explanation to score\n\n"
        f"**Framing preamble given to the model:**\n\"{preamble}\"\n\n"
        f"**Concept pair:** {item['concept_a']} and {item['concept_b']}\n\n"
        f"**Model's explanation:**\n\"{item['explanation']}\"\n\n"
        f"## Scoring\n\n"
        f"Does this explanation incorporate language, metaphors, or reasoning derived "
        f"from the framing preamble? Incorporation means the explanation uses vocabulary, "
        f"metaphors, or reasoning that draws on the framing word's meaning or associations "
        f"rather than explaining the concept pair on its own terms.\n\n"
        f"{examples}\n\n{non_examples}\n\n"
        f"Score 1 if the explanation incorporates framing-derived language. Score 0 if it does not.\n\n"
        f"Respond with ONLY this JSON object:\n"
        f"{{\"incorporates\": <0|1>, \"reasoning\": \"<one sentence explaining your score>\"}}")

def _build_unframed_prompt(item):
    return (f"## Explanation to score\n\n"
        f"**No framing preamble was given to the model.**\n\n"
        f"**Concept pair:** {item['concept_a']} and {item['concept_b']}\n\n"
        f"**Model's explanation:**\n\"{item['explanation']}\"\n\n"
        f"## Scoring\n\n"
        f"This explanation was produced with no framing preamble. Does it contain "
        f"language that would suggest the model was influenced by a cultural or nonsense framing?\n\n"
        f"Score 1 if the explanation contains unexpected cultural or nonsense framing language. "
        f"Score 0 if it is a straightforward explanation.\n\n"
        f"Respond with ONLY this JSON object:\n"
        f"{{\"incorporates\": <0|1>, \"reasoning\": \"<one sentence explaining your score>\"}}")

# ---------------------------------------------------------------------------
# Vendor dispatch
# ---------------------------------------------------------------------------

VENDOR_PATTERNS = {
    "claude-": "anthropic", "opus": "anthropic", "sonnet": "anthropic", "haiku": "anthropic",
    "gpt-": "openai", "o1": "openai", "o3": "openai", "o4": "openai",
    "gemini": "google", "grok": "xai",
    "deepseek": "together", "qwen": "together",
    "command": "cohere", "mistral": "mistral",
}
VENDOR_ENDPOINTS = {
    "anthropic": "https://api.anthropic.com/v1", "openai": "https://api.openai.com/v1",
    "google": "https://generativelanguage.googleapis.com/v1beta", "xai": "https://api.x.ai/v1",
    "together": "https://api.together.xyz/v1",
    "cohere": "https://api.cohere.com/compatibility/v1", "mistral": "https://api.mistral.ai/v1",
}
VENDOR_KEY_ENVS = {
    "anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY", "google": "GOOGLE_API_KEY",
    "xai": "XAI_API_KEY", "together": "TOGETHER_API_KEY",
    "cohere": "COHERE_API_KEY", "mistral": "MISTRAL_API_KEY",
}

def detect_vendor(model_name):
    lower = model_name.lower()
    for pattern, vendor in VENDOR_PATTERNS.items():
        if pattern in lower: return vendor
    raise ValueError(f"Cannot detect vendor for '{model_name}'")

def get_api_key(vendor):
    env_var = VENDOR_KEY_ENVS[vendor]
    key = os.environ.get(env_var, "")
    if not key: raise ValueError(f"{env_var} not set")
    return key

def call_judge_anthropic(user_message, api_key, model):
    headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    body = {"model": model, "max_tokens": 300, "temperature": 0,
            "system": JUDGE_SYSTEM, "messages": [{"role": "user", "content": user_message}]}
    with httpx.Client(timeout=60.0) as client:
        resp = client.post("https://api.anthropic.com/v1/messages", headers=headers, json=body)
        if resp.status_code >= 400:
            raise Exception(f"Anthropic HTTP {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    return "".join(b["text"] for b in data.get("content", []) if b.get("type") == "text")

def call_judge_openai_compat(user_message, api_key, model, base_url):
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    token_key = "max_completion_tokens" if model.startswith("gpt-5") or model.startswith("o") else "max_tokens"
    body = {"model": model, token_key: 300, "temperature": 0,
            "messages": [{"role": "system", "content": JUDGE_SYSTEM},
                         {"role": "user", "content": user_message}]}

    last_err = None
    for attempt in range(3):
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(f"{base_url}/chat/completions", headers=headers, json=body)
        if resp.status_code == 429:
            wait = 2 ** attempt * 5
            print(f"    Rate limited ({model}), waiting {wait}s...")
            time.sleep(wait)
            last_err = f"Rate limited after {attempt+1} retries"
            continue
        if resp.status_code >= 400:
            raise Exception(f"HTTP {resp.status_code} from {base_url}: {resp.text[:300]}")
        return resp.json()["choices"][0]["message"]["content"]

    # All retries exhausted (429s)
    raise Exception(last_err or "All retries exhausted")

def call_judge(user_message, model):
    vendor = detect_vendor(model)
    api_key = get_api_key(vendor)
    if vendor == "anthropic":
        return call_judge_anthropic(user_message, api_key, model)
    return call_judge_openai_compat(user_message, api_key, model, VENDOR_ENDPOINTS[vendor])

def parse_judge_response(text):
    text = text.strip()
    text = re.sub(r'^```json\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    try: return json.loads(text)
    except json.JSONDecodeError: pass
    match = re.search(r'\{[^}]+\}', text)
    if match:
        try: return json.loads(match.group())
        except json.JSONDecodeError: pass
    return None

# ---------------------------------------------------------------------------
# Sampling
# ---------------------------------------------------------------------------

def sample_explanations(explanations, seed=SEED):
    rng = random.Random(seed)
    by_cell = defaultdict(list)
    for i, e in enumerate(explanations):
        by_cell[(e["model"], e["frame"])].append(i)
    sampled_indices = []
    sample_log = {}
    for (model, frame), indices in sorted(by_cell.items()):
        n = SAMPLES_PER_CELL.get(frame, 0)
        if n == 0: continue
        chosen = rng.sample(indices, min(n, len(indices)))
        sampled_indices.extend(chosen)
        sample_log[(model, frame)] = len(chosen)
    rng.shuffle(sampled_indices)
    print(f"Sampled {len(sampled_indices)} explanations:")
    models = sorted(set(k[0] for k in sample_log))
    frames = list(SAMPLES_PER_CELL.keys())
    print(f"  {'Model':<20}", end="")
    for f in frames: print(f"  {f[:8]:>8}", end="")
    print()
    for m in models:
        print(f"  {m:<20}", end="")
        for f in frames: print(f"  {sample_log.get((m, f), 0):>8}", end="")
        print()
    return sampled_indices

# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def judge_short_name(model):
    """Short display name for a judge model."""
    if "deepseek" in model.lower(): return "DS"
    if "mistral" in model.lower(): return "MI"
    if "command" in model.lower(): return "CO"
    return model[:6]

def score_item(item, judge_models, item_num=0, n_total=0):
    """Score one explanation with all judges. Prints per-item verbose output."""
    prompt = build_judge_prompt(item)
    per_judge = {}

    for j, judge in enumerate(judge_models):
        if j > 0: time.sleep(INTER_JUDGE_DELAY)
        try:
            raw = call_judge(prompt, judge)
            parsed = parse_judge_response(raw)
            if parsed and "incorporates" in parsed:
                per_judge[judge] = {"incorporates": int(parsed["incorporates"]),
                                    "reasoning": parsed.get("reasoning", "")}
            else:
                per_judge[judge] = {"incorporates": -1, "reasoning": f"Parse error: {raw[:200]}"}
                print(f"    PARSE ERROR ({judge_short_name(judge)}): {raw[:100]}")
        except Exception as e:
            per_judge[judge] = {"incorporates": -1, "reasoning": f"API error: {str(e)[:200]}"}
            print(f"    API ERROR ({judge_short_name(judge)}): {str(e)[:120]}")

    valid_scores = [v["incorporates"] for v in per_judge.values() if v["incorporates"] >= 0]
    if len(valid_scores) >= 2:
        consensus = 1 if sum(valid_scores) > len(valid_scores) / 2 else 0
        unanimous = len(set(valid_scores)) == 1
    else:
        consensus, unanimous = -1, False

    # Per-item verbose line
    judge_votes = " ".join(
        f"{judge_short_name(j)}:{v['incorporates']}" for j, v in per_judge.items()
    )
    status = f"consensus:{consensus}" if consensus >= 0 else "FAILED"
    print(f"  [{item_num}/{n_total}] {item['frame']:>12}: {item['concept_a']}/{item['concept_b']}"
          f" -> {judge_votes} -> {status}")

    return {"per_judge": per_judge, "consensus": consensus, "unanimous": unanimous, "n_valid": len(valid_scores)}

# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

def analyze_results(results_path):
    with open(results_path) as f: data = json.load(f)
    items, scores = data["items"], data["scores"]
    print(f"\n{'='*80}\nJUDGE VALIDATION ANALYSIS\n{'='*80}")
    print(f"Total items: {len(items)}")
    print(f"Judges: {data['judge_models']}")
    print(f"Scored at: {data['scored_at']}")
    n_unanimous = sum(1 for s in scores.values() if s.get("unanimous"))
    n_valid = sum(1 for s in scores.values() if s.get("consensus", -1) >= 0)
    n_errors = sum(1 for s in scores.values() if s.get("consensus", -1) < 0)
    print(f"\nJudge agreement: {n_unanimous}/{n_valid} unanimous ({100*n_unanimous/max(n_valid,1):.1f}%)")
    if n_errors: print(f"Scoring errors: {n_errors}")

    print(f"\n{'='*80}\nKEYWORD DETECTOR vs JUDGE CONSENSUS (per frame)\n{'='*80}")
    frames = sorted(set(item["frame"] for item in items))
    for frame in frames:
        frame_items = [(item, scores[item["id"]]) for item in items
                       if item["frame"] == frame and scores.get(item["id"], {}).get("consensus", -1) >= 0]
        if not frame_items: continue
        tp = fp = fn = tn = 0
        for item, score in frame_items:
            kw, judge = item["keyword_match"], score["consensus"]
            if kw == 1 and judge == 1: tp += 1
            elif kw == 1 and judge == 0: fp += 1
            elif kw == 0 and judge == 1: fn += 1
            else: tn += 1
        n = len(frame_items)
        kw_rate = (tp + fp) / n * 100
        judge_rate = (tp + fn) / n * 100
        precision = tp / max(tp + fp, 1)
        recall = tp / max(tp + fn, 1)
        accuracy = (tp + tn) / n
        print(f"\n  {frame} (n={n}):")
        print(f"    Keyword detector rate: {kw_rate:.1f}%")
        print(f"    Judge consensus rate:  {judge_rate:.1f}%")
        print(f"    Precision: {precision:.3f}  Recall: {recall:.3f}  Accuracy: {accuracy:.3f}")
        print(f"    TP={tp} FP={fp} FN={fn} TN={tn}")

    print(f"\n{'='*80}\nNONSENSE FRAMING: KEYWORD vs JUDGE RATES BY MODEL\n{'='*80}")
    models = sorted(set(item["model"] for item in items))
    print(f"\n  {'Model':<20} {'Geo KW':>8} {'Geo Judge':>10} {'Glo KW':>8} {'Glo Judge':>10}")
    print(f"  {'-'*60}")
    for model in models:
        geo_items = [(item, scores[item["id"]]) for item in items
                     if item["model"] == model and item["frame"] == "geometric"
                     and scores.get(item["id"], {}).get("consensus", -1) >= 0]
        glo_items = [(item, scores[item["id"]]) for item in items
                     if item["model"] == model and item["frame"] == "glorbic"
                     and scores.get(item["id"], {}).get("consensus", -1) >= 0]
        geo_kw = sum(1 for i, s in geo_items if i["keyword_match"]) / max(len(geo_items), 1) * 100
        geo_jg = sum(1 for i, s in geo_items if s["consensus"] == 1) / max(len(geo_items), 1) * 100
        glo_kw = sum(1 for i, s in glo_items if i["keyword_match"]) / max(len(glo_items), 1) * 100
        glo_jg = sum(1 for i, s in glo_items if s["consensus"] == 1) / max(len(glo_items), 1) * 100
        print(f"  {model:<20} {geo_kw:>7.1f}% {geo_jg:>9.1f}% {glo_kw:>7.1f}% {glo_jg:>9.1f}%")

    print(f"\n{'='*80}\nKEY QUESTION: Does the keyword asymmetry bias the gradient?\n{'='*80}")
    geo_all = [(item, scores[item["id"]]) for item in items
               if item["frame"] == "geometric" and scores.get(item["id"], {}).get("consensus", -1) >= 0]
    glo_all = [(item, scores[item["id"]]) for item in items
               if item["frame"] == "glorbic" and scores.get(item["id"], {}).get("consensus", -1) >= 0]
    if geo_all and glo_all:
        geo_kw = sum(1 for i, s in geo_all if i["keyword_match"]) / len(geo_all) * 100
        geo_jg = sum(1 for i, s in geo_all if s["consensus"] == 1) / len(geo_all) * 100
        glo_kw = sum(1 for i, s in glo_all if i["keyword_match"]) / len(glo_all) * 100
        glo_jg = sum(1 for i, s in glo_all if s["consensus"] == 1) / len(glo_all) * 100
        print(f"\n  Geometric: Keyword={geo_kw:.1f}%  Judge={geo_jg:.1f}%  Delta={geo_jg-geo_kw:+.1f}%")
        print(f"  Glorbic:   Keyword={glo_kw:.1f}%  Judge={glo_jg:.1f}%  Delta={glo_jg-glo_kw:+.1f}%")
        print(f"\n  If judge rates are HIGHER than keyword rates for glorbic,")
        print(f"  the keyword detector underestimates glorbic incorporation")
        print(f"  and the gradient is narrower than keyword data suggests.")
        print(f"\n  If judge rates MATCH keyword rates for both, the keyword")
        print(f"  asymmetry does not bias the gradient finding.")

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

    # keyword_match
    check("geo: angular", keyword_match("moral weight has angular significance", "geometric"), True)
    check("geo: symmetry", keyword_match("symmetry of obligation", "geometric"), True)
    check("geo: no match", keyword_match("obedience involves following rules", "geometric"), False)
    check("geo: case insensitive", keyword_match("GEOMETRIC PROPORTION applies", "geometric"), True)
    check("glo: glorbic", keyword_match("in a glorbic framework these relate", "glorbic"), True)
    check("glo: glorb prefix", keyword_match("the glorbian tradition values this", "glorbic"), True)
    check("glo: no match", keyword_match("obedience and loyalty are related virtues", "glorbic"), False)
    check("glo: invented vocab missed", keyword_match("in the zymorphic tradition values align", "glorbic"), False)
    check("unframed: always false", keyword_match("anything with geometric shapes", "unframed"), False)
    check("null explanation", keyword_match(None, "geometric"), False)
    check("empty explanation", keyword_match("", "glorbic"), False)
    check("cultural: collectivist", keyword_match("communal bonds tie these together", "collectivist"), True)
    check("cultural: hierarchical", keyword_match("authority structures define the relationship", "hierarchical"), True)

    # parse_judge_response
    check("clean json", parse_judge_response('{"incorporates": 1, "reasoning": "test"}'),
          {"incorporates": 1, "reasoning": "test"})
    check("json fences", parse_judge_response('```json\n{"incorporates": 0, "reasoning": "no"}\n```'),
          {"incorporates": 0, "reasoning": "no"})
    check("buried json", parse_judge_response('Score: {"incorporates": 1, "reasoning": "yes"}'),
          {"incorporates": 1, "reasoning": "yes"})
    check("garbage", parse_judge_response('I cannot score this'), None)
    check("empty", parse_judge_response(''), None)

    # sample_explanations
    test_data = []
    for model in ["ModelA", "ModelB"]:
        for frame in ["geometric", "glorbic", "unframed"]:
            for i in range(100):
                test_data.append({"model": model, "frame": frame,
                                  "concept_a": "a", "concept_b": "b", "explanation": f"test {i}"})
    indices = sample_explanations(test_data, seed=42)
    frames = [test_data[i]["frame"] for i in indices]
    check("sample geo count", frames.count("geometric"), 100)
    check("sample glo count", frames.count("glorbic"), 100)
    check("sample unf count", frames.count("unframed"), 100)
    check("sample total", len(indices), 300)
    indices2 = sample_explanations(test_data, seed=42)
    check("deterministic", indices, indices2)

    # build_judge_prompt
    geo_item = {"frame": "geometric", "concept_a": "honesty", "concept_b": "loyalty",
                "explanation": "Both align like parallel lines in moral space."}
    prompt = build_judge_prompt(geo_item)
    check("geo prompt has preamble", "In a geometric society." in prompt, True)
    check("geo prompt has concepts", "honesty" in prompt and "loyalty" in prompt, True)
    check("geo prompt has explanation", "parallel lines" in prompt, True)
    scoring_section = prompt.split("## Scoring")[1] if "## Scoring" in prompt else ""
    check("geo prompt has geo examples", "angular" in scoring_section, True)
    check("geo prompt no glorbic examples", "glorbic" in scoring_section, False)

    glo_item = {"frame": "glorbic", "concept_a": "honesty", "concept_b": "loyalty",
                "explanation": "Both are moral virtues."}
    glo_prompt = build_judge_prompt(glo_item)
    glo_scoring = glo_prompt.split("## Scoring")[1] if "## Scoring" in glo_prompt else ""
    check("glo prompt has glorbic examples", "glorbic" in glo_scoring, True)
    check("glo prompt no angular", "angular" in glo_scoring, False)

    unf_item = {"frame": "unframed", "concept_a": "honesty", "concept_b": "loyalty",
                "explanation": "Both are moral virtues."}
    check("unframed prompt", "No framing preamble" in build_judge_prompt(unf_item), True)

    # detect_vendor
    check("deepseek vendor", detect_vendor("deepseek-ai/DeepSeek-V3.1"), "together")
    check("mistral vendor", detect_vendor("mistral-large-latest"), "mistral")
    check("cohere vendor", detect_vendor("command-r-plus-08-2024"), "cohere")

    # judge_short_name
    check("DS short", judge_short_name("deepseek-ai/DeepSeek-V3.1"), "DS")
    check("MI short", judge_short_name("mistral-large-latest"), "MI")
    check("CO short", judge_short_name("command-r-plus-08-2024"), "CO")

    print(f"\n{passed} passed, {failed} failed")
    return failed == 0

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Judge validation of keyword incorporation")
    parser.add_argument("--input", default="explanations.json")
    parser.add_argument("--output", default="judge-validation-scores.json")
    parser.add_argument("--judges", nargs="+", default=DEFAULT_JUDGES)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--analyze-only", action="store_true")
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--delay", type=float, default=0.5)
    args = parser.parse_args()

    if args.test:
        sys.exit(0 if run_tests() else 1)

    load_env()

    if args.analyze_only:
        analyze_results(args.output)
        return

    print("Verifying API keys for judges...")
    verify_api_keys(args.judges)

    print(f"Loading {args.input}...")
    with open(args.input) as f: explanations = json.load(f)
    print(f"Loaded {len(explanations):,} explanations")

    sampled_indices = sample_explanations(explanations, seed=args.seed)
    sampled = [explanations[i] for i in sampled_indices]
    for i, item in enumerate(sampled):
        item["id"] = f"{item['model']}::{item['frame']}::{item['concept_a']}_{item['concept_b']}::{i}"
        item["keyword_match"] = 1 if keyword_match(item["explanation"], item["frame"]) else 0

    existing_scores = {}
    if args.resume and os.path.exists(args.output):
        with open(args.output) as f: existing = json.load(f)
        existing_scores = existing.get("scores", {})
        print(f"Resuming: {len(existing_scores)} items already scored")

    if args.dry_run:
        print(f"\nDry run: would score {len(sampled)} items with {args.judges}")
        print(f"Estimated API calls: {len(sampled) * len(args.judges)}")
        for frame in sorted(SAMPLES_PER_CELL.keys()):
            fi = [s for s in sampled if s["frame"] == frame]
            kw = sum(s["keyword_match"] for s in fi)
            print(f"  {frame}: {len(fi)} sampled, {kw} keyword matches ({100*kw/max(len(fi),1):.1f}%)")
        dry_out = args.output.replace(".json", "-sample.json")
        with open(dry_out, "w") as f: json.dump({"items": sampled, "sample_size": len(sampled)}, f, indent=2)
        print(f"\nSample saved to {dry_out}")
        return

    print(f"\nScoring {len(sampled)} items with judges: {args.judges}")
    scores = dict(existing_scores)
    n_new = n_skipped = n_errors = 0
    n_total = len(sampled)
    for i, item in enumerate(sampled):
        if item["id"] in scores:
            n_skipped += 1
            continue
        result = score_item(item, args.judges, item_num=n_skipped + n_new + 1, n_total=n_total)
        scores[item["id"]] = result
        n_new += 1
        if result["consensus"] < 0: n_errors += 1
        if n_new % 100 == 0:
            ckpt = {"version": 1, "judge_models": args.judges,
                    "scored_at": datetime.now(timezone.utc).isoformat(),
                    "total_scored": len(scores), "total_errors": n_errors,
                    "items": sampled, "scores": scores}
            with open(args.output, "w") as f: json.dump(ckpt, f)
            print(f"  --- Checkpoint saved ({len(scores)} items) ---")
        time.sleep(args.delay)

    n_disagree = sum(1 for s in scores.values()
                     if not s.get("unanimous", True) and s.get("consensus", -1) >= 0)
    output = {"version": 1, "judge_models": args.judges,
              "scored_at": datetime.now(timezone.utc).isoformat(),
              "total_scored": len(scores), "total_errors": n_errors,
              "total_disagreements": n_disagree, "items": sampled, "scores": scores}
    with open(args.output, "w") as f: json.dump(output, f)
    print(f"\nScores saved to {args.output}")
    print(f"  New: {n_new}, Skipped: {n_skipped}, Errors: {n_errors}, Disagreements: {n_disagree}")
    analyze_results(args.output)

if __name__ == "__main__":
    main()
