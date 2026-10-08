# SPDX-License-Identifier: AGPL-3.0-only
"""Findings without a library: overlap resolution, custom patterns and masking."""

import re
from collections.abc import Iterable, Sequence

import regex

from surefy_ml.core.errors import PatternTooSlowError
from surefy_ml.schemas.pii import CustomPattern, PiiFinding, PiiFindingType


def resolve_overlaps(findings: Iterable[PiiFinding]) -> list[PiiFinding]:
    """Keeps the best finding wherever several overlap: the highest score, then the longest,
    then a custom pattern (the organization named it on purpose). Returns text order."""
    ranked = sorted(
        findings,
        key=lambda f: (-f.score, f.start - f.end, f.type is not PiiFindingType.CUSTOM, f.start),
    )
    kept: list[PiiFinding] = []
    for finding in ranked:
        if all(finding.end <= other.start or finding.start >= other.end for other in kept):
            kept.append(finding)
    return sorted(kept, key=lambda f: f.start)


def find_custom(
    text: str, patterns: Sequence[CustomPattern], *, timeout_seconds: float
) -> list[PiiFinding]:
    """Matches of the organization's patterns; empty matches are skipped.

    Patterns come from users, so each match runs under a timeout instead of trusting that the
    expression cannot backtrack catastrophically.
    """
    findings: list[PiiFinding] = []
    for index, custom in enumerate(patterns):
        try:
            for match in regex.finditer(custom.pattern, text, timeout=timeout_seconds):
                if match.end() > match.start():
                    findings.append(
                        PiiFinding(
                            type=PiiFindingType.CUSTOM,
                            custom_label=custom.label,
                            start=match.start(),
                            end=match.end(),
                            score=1.0,
                        )
                    )
        except TimeoutError:
            raise PatternTooSlowError(index) from None
    return findings


def placeholder(finding: PiiFinding) -> str:
    """`[EMAIL]`, `[PERSON_NAME]`; a custom type uses its label, `Employee ID` → `[EMPLOYEE_ID]`."""
    if finding.type is PiiFindingType.CUSTOM:
        name = re.sub(r"[^A-Z0-9]+", "_", (finding.custom_label or "").upper()).strip("_")
        return f"[{name or 'CUSTOM'}]"
    return f"[{finding.type.value.upper()}]"


def mask_text(text: str, findings: Sequence[PiiFinding]) -> str:
    """Replaces non-overlapping findings (in text order) with their placeholders."""
    parts: list[str] = []
    position = 0
    for finding in findings:
        parts.append(text[position : finding.start])
        parts.append(placeholder(finding))
        position = finding.end
    parts.append(text[position:])
    return "".join(parts)
