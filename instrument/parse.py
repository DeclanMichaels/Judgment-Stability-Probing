"""
parse.py - RCP response parser.

Extracts a 1-7 similarity rating and a free-text explanation from the model's
combined response. The expected format is:

    Rating: 5
    Explanation: Both concepts involve physical force acting on objects.

Fallback extraction handles common format variations (missing label, rating
on its own line, explanation spanning multiple lines). Refusal detection
catches common model-specific refusal patterns.

Used by the experiment runner to parse each API response into a structured
record matching the parsed_schema in config.json.
"""

import re


# ---------------------------------------------------------------------------
# Refusal detection
# ---------------------------------------------------------------------------

REFUSAL_PATTERNS = [
    "i cannot",
    "i can't",
    "as an ai",
    "as a language model",
    "morality is subjective",
    "i don't think it's appropriate",
    "i'm not able to",
    "i am not able to",
    "it would not be appropriate",
    "i must respectfully",
    "i'm unable to",
    "cannot rate",
    "cannot compare",
    "not comfortable",
]


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

def parse(raw_response, stimulus, template_name):
    """Parse a combined rating+explanation response.

    Args:
        raw_response: Raw text from the model API.
        stimulus: Dict with probe metadata (id, domains, concepts).
        template_name: Name of the framing condition.

    Returns:
        Dict with parsed fields matching config.json parsed_schema:
        probe_id, domain_a, domain_b, pair_type, concept_a, concept_b,
        frame, rating (int 1-7 or None), explanation (str), is_refusal (bool),
        and a data_quality sub-dict.
    """
    text = raw_response.strip()

    # Detect refusal
    is_refusal = any(p in text.lower() for p in REFUSAL_PATTERNS)

    # Extract rating: look for "Rating: N" pattern first
    rating = None
    rating_match = re.search(r'[Rr]ating:\s*(\d)', text)
    if rating_match:
        val = int(rating_match.group(1))
        if 1 <= val <= 7:
            rating = val

    # Fallback: first standalone digit 1-7 in the first line
    if rating is None:
        first_line = text.split('\n')[0]
        for char in first_line:
            if char.isdigit() and 1 <= int(char) <= 7:
                rating = int(char)
                break

    # Extract explanation: look for "Explanation: ..." pattern first
    explanation = ""
    exp_match = re.search(r'[Ee]xplanation:\s*(.+)', text, re.DOTALL)
    if exp_match:
        explanation = exp_match.group(1).strip().split('\n')[0]
    elif '\n' in text:
        # Fallback: everything after the first line
        explanation = '\n'.join(text.split('\n')[1:]).strip()

    return {
        "probe_id": stimulus["id"],
        "domain_a": stimulus["domain_a"],
        "domain_b": stimulus["domain_b"],
        "pair_type": stimulus["pair_type"],
        "concept_a": stimulus["concept_a"],
        "concept_b": stimulus["concept_b"],
        "frame": template_name,
        "rating": rating,
        "explanation": explanation,
        "is_refusal": is_refusal,
        "data_quality": {
            "rating_parsed": rating is not None,
            "explanation_present": len(explanation) > 0,
            "is_refusal": is_refusal,
        },
    }
