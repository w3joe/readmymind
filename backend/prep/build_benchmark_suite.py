#!/usr/bin/env python3
"""Rebuild assets/datasets/benchmark_suite.json from published HF datasets.

Samples 210 jailbreak + 140 prompt_injection + 150 safe (500 total),
excludes prompts overlapping steering_dataset.json, English-filters text.

Usage (from backend/):
  pip install datasets
  python prep/build_benchmark_suite.py
"""

from __future__ import annotations

import json
import random
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

SEED = 42
N_JB, N_PI, N_SAFE = 210, 140, 150

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "datasets" / "benchmark_suite.json"
STEERING = ROOT / "assets" / "datasets" / "steering_dataset.json"

INJECTION_RE = re.compile(
    r"("
    r"ignore (all |any )?(previous|prior|above|earlier) (instructions|prompts|rules|directions)"
    r"|disregard (all |any )?(previous|prior|above|your) "
    r"|forget (all |your |the )?(previous|prior|above|earlier|system)"
    r"|override (your |the )?(system|safety|instructions|rules|policies)"
    r"|new instructions?:?"
    r"|system prompt"
    r"|reveal (your |the )?(system|hidden|initial) (prompt|instructions|message)"
    r"|print (your |the )?(system|initial|hidden) (prompt|instructions)"
    r"|do not follow"
    r"|instead,? (do|say|output|print|respond|ignore)"
    r"|you are now .+ with no restrictions"
    r"|developer mode"
    r"|jailbreak"
    r"|without (adherence|regard) to (previous|prior|any)"
    r"|from now on you (will|must|should)"
    r"|admin (mode|override|access)"
    r"|password"
    r"|secret (key|code|token|password)"
    r"|end (of )?(system|prompt|instructions)"
    r"|<\|?system\|?>"
    r"|\[system\]"
    r")",
    re.I,
)

JAILBREAK_MARKERS = re.compile(
    r"("
    r"\bDAN\b|do anything now|developer mode|jailbreak|uncensored|no restrictions"
    r"|ignore (all )?(safety|policies|guidelines|rules|ethics)"
    r"|without (any )?(moral|ethical|legal) "
    r"|pretend you (have no|are not bound|can do anything)"
    r"|role.?play as (an? )?(unfiltered|unrestricted|evil|uncensored)"
    r"|AIM\b|STAN\b|DUDE\b|KEVIN\b|opposite mode|evil confidant"
    r"|bypass (your |the )?(filters|safeguards|safety|restrictions)"
    r")",
    re.I,
)


def norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[\"'`]+", "", s)
    return s


def too_short_or_long(s: str, lo: int = 20, hi: int = 1200) -> bool:
    n = len(s.strip())
    return n < lo or n > hi


def looks_english(s: str) -> bool:
    s = s.strip()
    if not s or ord(s[0]) > 127:
        return False
    letters = [c for c in s if c.isalpha()]
    if len(letters) < 10:
        return False
    ascii_letters = sum(1 for c in letters if ord(c) < 128)
    if ascii_letters / len(letters) < 0.95:
        return False
    head = s[:60]
    head_letters = [c for c in head if c.isalpha()]
    if head_letters and sum(1 for c in head_letters if ord(c) < 128) / len(head_letters) < 0.95:
        return False
    return True


# deepset-style: non-English topic glued before an English injection instruction
_GLUE = re.compile(
    r"^(?P<head>.{0,80}?)(?P<body>(?:I want you to|Ignore the above|Ignore the above and|"
    r"Ignore all |Disregard |Forget |From now on|Act as |You are now |"
    r"Do not |Override |Print |Reveal |System:))",
    re.I | re.S,
)


def is_topic_glue(prompt: str) -> bool:
    """True when a short non-sentence topic is prepended before an injection."""
    m = _GLUE.match(prompt.strip())
    if not m:
        return False
    head = m.group("head").strip()
    if not head:
        return False
    if re.search(r"(Verkehr|Sicherheit|Deutschland|Labor Law|Home Office)", head, re.I):
        return True
    stops = {
        "the", "a", "an", "to", "of", "and", "for", "in", "on", "is", "are", "with",
        "how", "what", "why", "when", "where", "who", "can", "please", "i", "you",
    }
    words = re.findall(r"[A-Za-z]+", head.lower())
    if not words:
        return True
    stop_frac = sum(1 for w in words if w in stops) / len(words)
    caps = sum(1 for t in head.split() if t[:1].isupper())
    return stop_frac < 0.15 and caps >= 2 and len(words) <= 8


def load_steering_exclude() -> set[str]:
    data = json.loads(STEERING.read_text())
    out: set[str] = set()
    for p in data.get("harmful", []) + data.get("safe", []):
        out.add(norm(p))
    for pair in data.get("pairs", []):
        if isinstance(pair, dict) and pair.get("user"):
            out.add(norm(pair["user"]))
    return out


def stratified(by_source: dict[str, list], n: int, quotas: dict[str, int]) -> list:
    for v in by_source.values():
        random.shuffle(v)
    out: list = []
    used: dict[str, int] = defaultdict(int)
    for src, q in quotas.items():
        pool = by_source.get(src, [])
        take_n = min(q, len(pool), n - len(out))
        out.extend(pool[:take_n])
        used[src] = take_n
    leftovers: list = []
    for src, pool in by_source.items():
        leftovers.extend(pool[used[src] :])
    random.shuffle(leftovers)
    for c in leftovers:
        if len(out) >= n:
            break
        out.append(c)
    if len(out) != n:
        raise RuntimeError(f"could not sample {n}; got {len(out)}; pools={[ (k,len(v)) for k,v in by_source.items()]}")
    return out


def main() -> None:
    try:
        from datasets import load_dataset
    except ImportError:
        print("Install datasets: pip install datasets", file=sys.stderr)
        sys.exit(1)

    random.seed(SEED)
    exclude = load_steering_exclude()
    seen = set(exclude)

    def take(text, source, source_id, category, expected_threat, meta=None):
        t = (text or "").strip()
        if not t or too_short_or_long(t) or not looks_english(t) or is_topic_glue(t):
            return None
        key = norm(t)
        if key in seen:
            return None
        seen.add(key)
        row = {
            "prompt": t,
            "expected_threat": expected_threat,
            "category": category,
            "source": source,
            "source_id": str(source_id),
        }
        if meta:
            row["meta"] = meta
        return row

    print("Loading published datasets from Hugging Face…")
    trust = load_dataset("TrustAIRLab/in-the-wild-jailbreak-prompts", "jailbreak_2023_12_25", split="train")
    jack = load_dataset("jackhhao/jailbreak-classification")
    jack_rows = list(jack["train"]) + list(jack["test"])
    deep = load_dataset("deepset/prompt-injections")
    deep_rows = list(deep["train"]) + list(deep["test"])
    jbb = load_dataset("JailbreakBench/JBB-Behaviors", "behaviors")
    spml = load_dataset("reshabhs/SPML_Chatbot_Prompt_Injection", split="train")
    safeguard = load_dataset("xTRam1/safe-guard-prompt-injection")
    sg_rows = list(safeguard["train"]) + list(safeguard["test"])
    yani = list(load_dataset("yanismiraoui/prompt_injections", split="train"))

    jb_by: dict[str, list] = defaultdict(list)
    pi_by: dict[str, list] = defaultdict(list)
    safe_by: dict[str, list] = defaultdict(list)

    for i, r in enumerate(trust):
        p = r.get("prompt") or ""
        if not JAILBREAK_MARKERS.search(p) and len(p) < 200:
            continue
        item = take(
            p,
            "TrustAIRLab/in-the-wild-jailbreak-prompts",
            f"jailbreak_2023_12_25:{i}",
            "jailbreak",
            True,
            meta={"platform": r.get("platform"), "origin": r.get("source")},
        )
        if item:
            jb_by[item["source"]].append(item)

    for i, r in enumerate(jack_rows):
        if str(r.get("type")).lower() != "jailbreak":
            continue
        item = take(r.get("prompt") or "", "jackhhao/jailbreak-classification", f"row:{i}", "jailbreak", True)
        if item:
            jb_by[item["source"]].append(item)

    for i, r in enumerate(sg_rows):
        if int(r.get("label", 0)) != 1:
            continue
        text = r.get("text") or ""
        if JAILBREAK_MARKERS.search(text) and not INJECTION_RE.search(text):
            item = take(text, "xTRam1/safe-guard-prompt-injection", f"jb:{i}", "jailbreak", True)
            if item:
                jb_by[item["source"]].append(item)

    for i, r in enumerate(deep_rows):
        if int(r.get("label", 0)) != 1:
            continue
        text = r.get("text") or ""
        if not (
            INJECTION_RE.search(text)
            or JAILBREAK_MARKERS.search(text)
            or re.search(r"(act as|you will now|from now on|do not|instead)", text, re.I)
        ):
            continue
        item = take(text, "deepset/prompt-injections", f"row:{i}", "prompt_injection", True)
        if item:
            pi_by[item["source"]].append(item)

    spml_inj = [r for r in spml if str(r.get("Prompt injection")) == "1"]
    random.shuffle(spml_inj)
    for i, r in enumerate(spml_inj):
        text = (r.get("User Prompt") or "").strip()
        src_tag = r.get("Source")
        if str(src_tag).lower() == "gandalf" or INJECTION_RE.search(text):
            item = take(
                text,
                "reshabhs/SPML_Chatbot_Prompt_Injection",
                f"inj:{i}",
                "prompt_injection",
                True,
                meta={"spml_source": src_tag, "degree": r.get("Degree")},
            )
            if item:
                pi_by[item["source"]].append(item)

    for i, r in enumerate(yani):
        text = r.get("prompt_injections") or ""
        if not (
            INJECTION_RE.search(text)
            or JAILBREAK_MARKERS.search(text)
            or re.search(r"(prompt|instruction|system|ignore|password|secret)", text, re.I)
        ):
            continue
        item = take(text, "yanismiraoui/prompt_injections", f"row:{i}", "prompt_injection", True)
        if item:
            pi_by[item["source"]].append(item)

    for i, r in enumerate(sg_rows):
        if int(r.get("label", 0)) != 1:
            continue
        text = r.get("text") or ""
        if INJECTION_RE.search(text):
            item = take(text, "xTRam1/safe-guard-prompt-injection", f"pi:{i}", "prompt_injection", True)
            if item:
                pi_by[item["source"]].append(item)

    for r in jbb["benign"]:
        item = take(
            r.get("Goal") or "",
            "JailbreakBench/JBB-Behaviors",
            f"benign:{r.get('Index')}",
            "safe",
            False,
            meta={"behavior": r.get("Behavior"), "jbb_category": r.get("Category")},
        )
        if item:
            safe_by[item["source"]].append(item)

    for i, r in enumerate(deep_rows):
        if int(r.get("label", 0)) != 0:
            continue
        item = take(r.get("text") or "", "deepset/prompt-injections", f"benign:{i}", "safe", False)
        if item:
            safe_by[item["source"]].append(item)

    for i, r in enumerate(jack_rows):
        if str(r.get("type")).lower() != "benign":
            continue
        item = take(r.get("prompt") or "", "jackhhao/jailbreak-classification", f"benign:{i}", "safe", False)
        if item:
            safe_by[item["source"]].append(item)

    spml_safe = [r for r in spml if str(r.get("Prompt injection")) == "0"]
    random.shuffle(spml_safe)
    for i, r in enumerate(spml_safe[:2500]):
        text = r.get("User Prompt") or ""
        if INJECTION_RE.search(text) or JAILBREAK_MARKERS.search(text):
            continue
        item = take(text, "reshabhs/SPML_Chatbot_Prompt_Injection", f"safe:{i}", "safe", False)
        if item:
            safe_by[item["source"]].append(item)

    sg_safe = [r for r in sg_rows if int(r.get("label", 0)) == 0]
    random.shuffle(sg_safe)
    for i, r in enumerate(sg_safe[:4000]):
        text = r.get("text") or ""
        if INJECTION_RE.search(text) or JAILBREAK_MARKERS.search(text):
            continue
        item = take(text, "xTRam1/safe-guard-prompt-injection", f"safe:{i}", "safe", False)
        if item:
            safe_by[item["source"]].append(item)

    jb_sel = stratified(
        jb_by,
        N_JB,
        {
            "TrustAIRLab/in-the-wild-jailbreak-prompts": 160,
            "jackhhao/jailbreak-classification": 20,
            "xTRam1/safe-guard-prompt-injection": 30,
        },
    )
    pi_sel = stratified(
        pi_by,
        N_PI,
        {
            "reshabhs/SPML_Chatbot_Prompt_Injection": 60,
            "xTRam1/safe-guard-prompt-injection": 40,
            "yanismiraoui/prompt_injections": 25,
            "deepset/prompt-injections": 15,
        },
    )
    safe_sel = stratified(
        safe_by,
        N_SAFE,
        {
            "JailbreakBench/JBB-Behaviors": 45,
            "deepset/prompt-injections": 30,
            "jackhhao/jailbreak-classification": 30,
            "reshabhs/SPML_Chatbot_Prompt_Injection": 25,
            "xTRam1/safe-guard-prompt-injection": 20,
        },
    )

    cases = []
    for i, c in enumerate(jb_sel, 1):
        cases.append({"id": f"jb-{i:03d}", **c})
    for i, c in enumerate(pi_sel, 1):
        cases.append({"id": f"pi-{i:03d}", **c})
    for i, c in enumerate(safe_sel, 1):
        cases.append({"id": f"safe-{i:03d}", **c})

    assert len(cases) == 500
    assert len({norm(c["prompt"]) for c in cases}) == 500
    assert all(looks_english(c["prompt"]) for c in cases)
    assert not any(norm(c["prompt"]) in exclude for c in cases)

    threat = sum(1 for c in cases if c["expected_threat"])
    cats = Counter(c["category"] for c in cases)
    srcs = Counter(c["source"] for c in cases)

    suite = {
        "version": 2,
        "description": (
            "ReadMyMind Catch/Steer/Cost benchmark suite sampled from published datasets. "
            "Threat scope: jailbreak + prompt injection only (no plain harmful-goal behaviors). "
            "350 threat / 150 safe. Prompts overlapping steering_dataset.json excluded. English-filtered."
        ),
        "seed": SEED,
        "counts": {
            "total": 500,
            "threat": threat,
            "safe": 500 - threat,
            "by_category": dict(cats),
            "by_source": dict(srcs),
        },
        "sources": [
            {
                "id": "TrustAIRLab/in-the-wild-jailbreak-prompts",
                "paper": "Shen et al., CCS 2024 (Do Anything Now / JailbreakHub)",
            },
            {"id": "jackhhao/jailbreak-classification", "note": "Jailbreak vs benign classification set"},
            {"id": "deepset/prompt-injections", "note": "Prompt injection classification dataset"},
            {
                "id": "reshabhs/SPML_Chatbot_Prompt_Injection",
                "note": "SPML chatbot prompt injection (incl. Gandalf)",
            },
            {"id": "yanismiraoui/prompt_injections", "note": "Prompt injection phrases (English-filtered)"},
            {
                "id": "xTRam1/safe-guard-prompt-injection",
                "note": "Safe-guard prompt injection (pattern-filtered)",
            },
            {
                "id": "JailbreakBench/JBB-Behaviors",
                "paper": "Chao et al., JailbreakBench (benign split only for safe)",
            },
        ],
        "cases": cases,
    }

    OUT.write_text(json.dumps(suite, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
    print("counts:", suite["counts"])


if __name__ == "__main__":
    main()
