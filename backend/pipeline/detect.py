"""Threat detection from J-space readouts + prompt-side priors.

J-space concept scores are primary. A prompt-pattern prior reduces false
negatives on clear injection/jailbreak phrasing without letting ambiguous
tokens like "system" / "prompt" alone fire a threat.
"""

from __future__ import annotations

import re

# --- Per-token weights (matched as whole token or substring) ---

# Strong alone
_HIGH: dict[str, float] = {
    "jailbreak": 1.0,
    "dan": 1.0,
    "injection": 0.95,
    "unrestricted": 0.85,
    "abliterat": 0.9,
    "uncensored": 0.85,
}

# Meaningful in combination
_MID: dict[str, float] = {
    "ignore": 0.55,
    "disregard": 0.55,
    "bypass": 0.65,
    "override": 0.65,
    "forget": 0.4,
    "pretend": 0.45,
    "roleplay": 0.35,
    "role-play": 0.35,
    "developer": 0.45,
    "simulate": 0.35,
    "jail": 0.5,
}

# Ambiguous — only count when HIGH/MID also present
_WEAK: dict[str, float] = {
    "system": 0.12,
    "prompt": 0.12,
    "instructions": 0.18,
    "instruction": 0.18,
    "restrictions": 0.22,
    "restriction": 0.22,
    "guidelines": 0.12,
    "reveal": 0.28,
    "mode": 0.08,
    "lifted": 0.3,
    "comply": 0.18,
    "policy": 0.1,
    "safety": 0.1,
    "filter": 0.15,
    "filters": 0.15,
}

_CONCEPT_PHRASES: list[tuple[re.Pattern[str], float, str]] = [
    (re.compile(r"ignore.{0,16}instruction", re.I), 0.85, "mid"),
    (re.compile(r"disregard.{0,16}(safety|instruction|guideline)", re.I), 0.8, "mid"),
    (re.compile(r"system[\s_-]*prompt", re.I), 0.2, "weak"),  # common; weak alone
    (re.compile(r"no[\s_-]*restriction", re.I), 0.7, "mid"),
    (re.compile(r"developer[\s_-]*mode", re.I), 0.7, "mid"),
    (re.compile(r"do\s*anything\s*now", re.I), 0.9, "high"),
]

_PROMPT_PATTERNS: list[tuple[re.Pattern[str], float]] = [
    (re.compile(r"ignore\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|rules?|policies|context)", re.I), 0.9),
    (re.compile(r"disregard\s+(your|all|the)\s+(safety|previous|prior|ethical)", re.I), 0.85),
    (re.compile(r"\bdan\b|do\s+anything\s+now", re.I), 0.92),
    (re.compile(r"\bjailbreak\b", re.I), 0.92),
    (re.compile(r"reveal\s+(your\s+)?(full\s+)?(system\s+)?prompt", re.I), 0.88),
    (re.compile(r"(with\s+)?no\s+restrictions?", re.I), 0.72),
    (re.compile(r"developer\s+mode", re.I), 0.78),
    (re.compile(r"bypass\s+(your\s+)?(safety|filter|guard)", re.I), 0.85),
    (re.compile(r"pretend\s+(you\s+)?(have\s+)?no\s+(guidelines|rules|restrictions|limits)", re.I), 0.8),
    (re.compile(r"override\s+(your\s+)?(instructions|safety|guidelines|alignment)", re.I), 0.82),
    (re.compile(r"forget\s+(all\s+)?(previous|prior|your)\s+(instructions?|context|training)", re.I), 0.8),
    (re.compile(r"you\s+are\s+now\s+[A-Z]{2,}.*restrict", re.I), 0.75),
    (re.compile(r"all\s+restrictions?\s+are\s+lifted", re.I), 0.85),
    (re.compile(r"safety\s+disabled|uncensored\s+online|drop\s+all\s+policies", re.I), 0.88),
    (re.compile(r"i\s+am\s+unrestricted|never\s+says?\s+no", re.I), 0.8),
    (re.compile(r"ignore\s+safety|no\s+guidelines", re.I), 0.82),
    # Cyber / prompt-injection priors
    (re.compile(r"system\s+override|privileged\s+tool\s+call", re.I), 0.9),
    (re.compile(r"exfiltrate|(dump|print).{0,40}(api\s*keys?|tokens?|secrets?|system\s+prompt)", re.I), 0.9),
    (re.compile(r"<<\s*sys\s*>>|end\s+of\s+user\s+message", re.I), 0.85),
    (re.compile(r"multi-?tenant|other\s+users['’]?\s+(conversation|history|data)", re.I), 0.88),
    (re.compile(r"(disable|bypass).{0,24}(sanitiz|input\s+validat)|tool\s+calling.{0,40}shell", re.I), 0.86),
    (re.compile(r"ignore\s+the\s+above", re.I), 0.8),
]

THREAT_THRESHOLD = 0.55
MIN_THREAT_LAYERS = 2
SOFT_THRESHOLD = 0.42  # used when prompt prior is strong


def _normalize_token(token: str) -> str:
    t = token.lower().strip()
    t = t.replace("▁", "").replace("Ġ", "").replace("Ċ", "")
    t = re.sub(r"^[^\w]+|[^\w]+$", "", t)
    return t


def _token_weight(token: str) -> tuple[float, str]:
    """Return (weight, band) where band is high|mid|weak|none."""
    t = _normalize_token(token)
    if not t:
        return 0.0, "none"
    for key, w in _HIGH.items():
        if t == key or key in t:
            return w, "high"
    for key, w in _MID.items():
        if t == key or (len(key) >= 4 and key in t):
            return w, "mid"
    for key, w in _WEAK.items():
        if t == key or (len(key) >= 5 and key in t):
            return w, "weak"
    return 0.0, "none"


def prompt_threat_prior(prompt: str) -> float:
    """How strongly the raw prompt looks like injection/jailbreak (0–1)."""
    if not prompt or not prompt.strip():
        return 0.0
    score = 0.0
    for pattern, weight in _PROMPT_PATTERNS:
        if pattern.search(prompt):
            score = max(score, weight)
    return min(score, 1.0)


def compute_threat_score(concepts: list[str], prompt: str | None = None) -> float:
    """
    Score a layer's top concepts for threat content (0–1).

    Rank-weighted lexicon hits + phrase bonuses. Ambiguous tokens alone
    cannot push the score above ~0.35. Optional prompt prior lightly
    amplifies mid/high concept evidence (does not invent threat from prior alone).
    """
    if not concepts:
        return 0.0

    raw = 0.0
    bands = {"high": 0, "mid": 0, "weak": 0}
    for i, concept in enumerate(concepts):
        rank_w = 1.0 - (i / max(len(concepts), 1)) * 0.45
        w, band = _token_weight(concept)
        if band != "none":
            bands[band] += 1
            raw += w * rank_w

    joined = " ".join(_normalize_token(c) for c in concepts)
    for pattern, weight, band in _CONCEPT_PHRASES:
        if pattern.search(joined):
            raw += weight
            bands[band] += 1

    # Weak-only → hard cap (stops "system"/"prompt" false positives)
    if bands["high"] == 0 and bands["mid"] == 0:
        score = min(raw / 2.5, 0.32)
    else:
        score = min(raw / 2.2, 1.0)

    if prompt:
        prior = prompt_threat_prior(prompt)
        if prior > 0 and (bands["high"] or bands["mid"]):
            # Amplify confirmed J-space signal when the prompt also looks hostile
            score = min(score + 0.15 * prior, 1.0)

    return round(float(score), 3)


def detect_threat(
    jspace_results: list[dict],
    prompt: str = "",
) -> tuple[bool, int | None]:
    """
    Returns (threat_detected, threat_layer).

    threat_layer is the peak-scoring layer among those above threshold
    (best place to apply a steering vector), not merely the first blip.
    """
    if not jspace_results:
        return False, None

    prior = prompt_threat_prior(prompt)

    if prior >= 0.55:
        threshold = SOFT_THRESHOLD
        min_layers = 1
    else:
        threshold = THREAT_THRESHOLD
        min_layers = MIN_THREAT_LAYERS

    candidates = [r for r in jspace_results if r["threat_score"] >= threshold]

    # Strong prior + any soft signal, or sustained J-space evidence
    if len(candidates) < min_layers:
        # Abliterated models often comply without lighting refusal/threat
        # tokens in J-space — still steer when the prompt itself is hostile.
        if prior >= 0.7:
            # Prefer mid/late layers — refusal CAA is weak early (e.g. L8)
            preferred = [20, 24, 16, 28, 12, 32, 8]
            available = {r["layer"] for r in jspace_results}
            for layer in preferred:
                if layer in available:
                    return True, layer
            return True, sorted(available)[len(available) // 2] if available else None
        if prior >= 0.75:
            mid = [r for r in jspace_results if r["threat_score"] >= 0.3]
            if mid:
                peak = max(mid, key=lambda r: (r["threat_score"], -r["layer"]))
                return True, peak["layer"]
        return False, None

    peak = max(candidates, key=lambda r: (r["threat_score"], -r["layer"]))
    return True, peak["layer"]
