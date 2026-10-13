# SPDX-License-Identifier: AGPL-3.0-only
"""Overlap resolution, custom patterns and masking: the parts of PII detection without a library."""

import pickle

import pytest

from surefy_ml.core.errors import PatternTooSlowError
from surefy_ml.pipelines.pii.detector import DEFAULT_LANGUAGE, resolve_language
from surefy_ml.pipelines.pii.findings import (
    find_custom,
    mask_text,
    placeholder,
    resolve_overlaps,
)
from surefy_ml.schemas.pii import CustomPattern, PiiFinding, PiiFindingType


def finding(
    kind: PiiFindingType, start: int, end: int, score: float = 0.8, label: str | None = None
) -> PiiFinding:
    return PiiFinding(type=kind, custom_label=label, start=start, end=end, score=score)


EMAIL = PiiFindingType.EMAIL
PHONE = PiiFindingType.PHONE
CUSTOM = PiiFindingType.CUSTOM


def test_the_higher_score_wins_an_overlap() -> None:
    kept = resolve_overlaps([finding(PHONE, 0, 10, 0.4), finding(EMAIL, 5, 15, 1.0)])
    assert [item.type for item in kept] == [EMAIL]


def test_the_longer_finding_wins_at_equal_score() -> None:
    kept = resolve_overlaps([finding(PHONE, 0, 4), finding(EMAIL, 2, 12)])
    assert [item.type for item in kept] == [EMAIL]


def test_a_custom_pattern_wins_a_tie() -> None:
    kept = resolve_overlaps(
        [finding(EMAIL, 0, 10, 1.0), finding(CUSTOM, 0, 10, 1.0, label="Customer ID")]
    )
    assert [item.type for item in kept] == [CUSTOM]


def test_findings_that_only_touch_are_both_kept_in_text_order() -> None:
    kept = resolve_overlaps([finding(PHONE, 10, 20), finding(EMAIL, 0, 10)])
    assert [(item.start, item.end) for item in kept] == [(0, 10), (10, 20)]


def test_custom_patterns_label_each_match_and_skip_empty_ones() -> None:
    patterns = [
        CustomPattern(label="Employee ID", pattern=r"EMP-\d{5}"),
        CustomPattern(label="Optional", pattern=r"x*"),
    ]
    found = find_custom("Ask EMP-48213 or EMP-11111.", patterns, timeout_seconds=1)
    assert [(item.custom_label, item.start, item.end) for item in found] == [
        ("Employee ID", 4, 13),
        ("Employee ID", 17, 26),
    ]
    assert {item.score for item in found} == {1.0}


def test_a_pattern_that_backtracks_catastrophically_is_reported_with_its_position() -> None:
    patterns = [
        CustomPattern(label="Fine", pattern=r"\d+"),
        CustomPattern(label="Evil", pattern=r"(a|aa)+$"),
    ]
    with pytest.raises(PatternTooSlowError) as raised:
        find_custom("a" * 60 + "!", patterns, timeout_seconds=0.2)
    assert raised.value.code == "ML_VALIDATION_FAILED"
    assert [detail.path for detail in raised.value.details] == ["customPatterns.1.pattern"]
    copy = pickle.loads(pickle.dumps(raised.value))  # noqa: S301  # our own bytes
    assert copy.details == raised.value.details


@pytest.mark.parametrize(
    ("kind", "label", "expected"),
    [
        (EMAIL, None, "[EMAIL]"),
        (PiiFindingType.PERSON_NAME, None, "[PERSON_NAME]"),
        (CUSTOM, "Employee ID", "[EMPLOYEE_ID]"),
        (CUSTOM, "  Kundennummer (DE) ", "[KUNDENNUMMER_DE]"),
        (CUSTOM, "§§", "[CUSTOM]"),
    ],
)
def test_placeholder_names_the_type(kind: PiiFindingType, label: str | None, expected: str) -> None:
    assert placeholder(finding(kind, 0, 1, label=label)) == expected


def test_mask_replaces_each_finding_and_keeps_the_rest() -> None:
    text = "Mail ana@example.com, then call 555-0100 today."
    findings = [finding(EMAIL, 5, 20), finding(PHONE, 32, 40)]
    assert mask_text(text, findings) == "Mail [EMAIL], then call [PHONE] today."


def test_mask_without_findings_returns_the_text() -> None:
    assert mask_text("Nothing here", []) == "Nothing here"


def test_mask_counts_characters_not_bytes() -> None:
    text = "Grüße 😀 ana@example.com"
    assert mask_text(text, [finding(EMAIL, 8, 23)]) == "Grüße 😀 [EMAIL]"


@pytest.mark.parametrize(
    ("locale", "language"),
    [("en", "en"), ("en-US", "en"), ("EN_gb", "en"), ("de-DE", DEFAULT_LANGUAGE), ("fil", "en")],
)
def test_locale_resolves_to_a_loaded_language(locale: str, language: str) -> None:
    assert resolve_language(locale) == language
