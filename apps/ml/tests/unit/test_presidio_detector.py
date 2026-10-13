# SPDX-License-Identifier: AGPL-3.0-only
"""PresidioPiiDetector with the real library and the spaCy model on short texts."""

import pytest

from surefy_ml.pipelines.pii.findings import mask_text
from surefy_ml.pipelines.pii.presidio_detector import PresidioPiiDetector
from surefy_ml.schemas.pii import CustomPattern, PiiFinding, PiiType

pytestmark = pytest.mark.slow

ALL_TYPES = list(PiiType)

# Test numbers only: the Luhn-valid card from the processors' docs, Presidio's sample IBAN,
# and an SSN with a valid area number.
SAMPLE = (
    "Maria Garcia (maria.garcia@example.com, +1 415-555-0132) lives at 221B Baker Street. "
    "Card 4111 1111 1111 1111, IBAN GB82 WEST 1234 5698 7654 32, SSN 536-90-4399."
)


@pytest.fixture(scope="module")
def detector() -> PresidioPiiDetector:
    return PresidioPiiDetector(min_score=0.35, pattern_timeout_seconds=0.5)


def run(
    detector: PresidioPiiDetector,
    text: str,
    types: list[PiiType] | None = None,
    patterns: list[CustomPattern] | None = None,
) -> list[PiiFinding]:
    [found] = detector.detect(
        [text],
        language="en",
        types=ALL_TYPES if types is None else types,
        custom_patterns=patterns or [],
    )
    return found


def found_text(text: str, findings: list[PiiFinding]) -> dict[str, str]:
    return {item.type.value: text[item.start : item.end] for item in findings}


def test_every_built_in_type_is_found(detector: PresidioPiiDetector) -> None:
    assert found_text(SAMPLE, run(detector, SAMPLE)) == {
        "person_name": "Maria Garcia",
        "email": "maria.garcia@example.com",
        "phone": "+1 415-555-0132",
        "address": "221B Baker Street",
        "payment_card": "4111 1111 1111 1111",
        "bank_account": "GB82 WEST 1234 5698 7654 32",
        "government_id": "536-90-4399",
    }


def test_the_uk_national_insurance_number_is_a_government_id(detector: PresidioPiiDetector) -> None:
    text = "Her NINO is AB 12 34 56 C."
    assert found_text(text, run(detector, text, [PiiType.GOVERNMENT_ID])) == {
        "government_id": "AB 12 34 56 C"
    }


def test_only_the_requested_types_are_looked_for(detector: PresidioPiiDetector) -> None:
    findings = run(detector, SAMPLE, [PiiType.EMAIL])
    assert found_text(SAMPLE, findings) == {"email": "maria.garcia@example.com"}


def test_no_types_and_no_patterns_finds_nothing(detector: PresidioPiiDetector) -> None:
    assert run(detector, SAMPLE, []) == []


def test_a_card_number_that_fails_the_checksum_is_not_a_card(detector: PresidioPiiDetector) -> None:
    assert run(detector, "Order 4111 1111 1111 1112 shipped", [PiiType.PAYMENT_CARD]) == []


def test_ordinary_text_has_no_findings(detector: PresidioPiiDetector) -> None:
    text = "The meeting needs 5 or more days of notice. Version 2.4 ships on Friday."
    assert run(detector, text) == []


def test_custom_patterns_are_found_beside_the_built_in_types(detector: PresidioPiiDetector) -> None:
    text = "Employee EMP-48213 wrote to ana@example.com."
    patterns = [CustomPattern(label="Employee ID", pattern=r"EMP-\d{5}")]
    findings = run(detector, text, [PiiType.EMAIL], patterns)
    assert [(item.type.value, item.custom_label) for item in findings] == [
        ("custom", "Employee ID"),
        ("email", None),
    ]
    assert mask_text(text, findings) == "Employee [EMPLOYEE_ID] wrote to [EMAIL]."


def test_texts_are_analyzed_independently(detector: PresidioPiiDetector) -> None:
    results = detector.detect(
        ["Write to ana@example.com", "Nothing here", "bo@example.org"],
        language="en",
        types=[PiiType.EMAIL],
        custom_patterns=[],
    )
    assert [len(found) for found in results] == [1, 0, 1]
