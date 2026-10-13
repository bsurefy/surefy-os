# SPDX-License-Identifier: AGPL-3.0-only
"""Personal-data detection and masking: request and response models of /v1/pii."""

from enum import StrEnum
from typing import Annotated
from uuid import UUID

import regex
from pydantic import Field, StringConstraints, field_validator

from surefy_ml.schemas.common import ApiModel

# Limits mirror @surefy/contracts (PII_PATTERN_MAX_LENGTH, PII_CUSTOM_LABEL_MAX_LENGTH).
MAX_TEXTS = 100
MAX_TEXT_LENGTH = 100_000
MAX_CUSTOM_PATTERNS = 50
MAX_PATTERN_LENGTH = 500
MAX_LABEL_LENGTH = 100


class PiiType(StrEnum):
    """The built-in personal-data types, named like `BUILT_IN_PII_TYPES` in @surefy/contracts."""

    PERSON_NAME = "person_name"
    EMAIL = "email"
    PHONE = "phone"
    PAYMENT_CARD = "payment_card"
    BANK_ACCOUNT = "bank_account"
    GOVERNMENT_ID = "government_id"
    ADDRESS = "address"


class PiiFindingType(StrEnum):
    """A built-in type, or `custom` for a pattern the organization defined."""

    PERSON_NAME = PiiType.PERSON_NAME.value
    EMAIL = PiiType.EMAIL.value
    PHONE = PiiType.PHONE.value
    PAYMENT_CARD = PiiType.PAYMENT_CARD.value
    BANK_ACCOUNT = PiiType.BANK_ACCOUNT.value
    GOVERNMENT_ID = PiiType.GOVERNMENT_ID.value
    ADDRESS = PiiType.ADDRESS.value
    CUSTOM = "custom"


class CustomPattern(ApiModel):
    """A custom type: a name and a regular expression (`regex` syntax, a superset of `re`)."""

    label: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_LABEL_LENGTH)
    ]
    pattern: str = Field(min_length=1, max_length=MAX_PATTERN_LENGTH)

    @field_validator("pattern")
    @classmethod
    def _compiles(cls, value: str) -> str:
        try:
            regex.compile(value)
        except regex.error as exc:
            raise ValueError(f"Not a valid regular expression: {exc}") from None
        return value


class PiiRequest(ApiModel):
    org_id: UUID  # logs and the per-organization concurrency cap only
    texts: list[Annotated[str, Field(min_length=1, max_length=MAX_TEXT_LENGTH)]] = Field(
        min_length=1, max_length=MAX_TEXTS
    )
    locale: str = Field(default="en", min_length=2, max_length=35)  # BCP-47, for example `en-US`
    # The built-in types to look for; absent means all of them, empty means none.
    types: list[PiiType] | None = None
    custom_patterns: list[CustomPattern] = Field(
        default_factory=list[CustomPattern], max_length=MAX_CUSTOM_PATTERNS
    )

    @field_validator("custom_patterns")
    @classmethod
    def _labels_are_unique(cls, patterns: list[CustomPattern]) -> list[CustomPattern]:
        labels = [pattern.label.casefold() for pattern in patterns]
        if len(labels) != len(set(labels)):
            raise ValueError("Custom pattern labels must be unique")
        return patterns


class PiiFinding(ApiModel):
    """Where one piece of personal data sits; the matched text is never returned."""

    type: PiiFindingType
    custom_label: str | None  # the label of a custom pattern
    start: int = Field(ge=0)  # Unicode code points into the original text, end exclusive
    end: int = Field(ge=1)
    score: float = Field(ge=0, le=1)


class DetectedText(ApiModel):
    findings: list[PiiFinding]  # in text order, without overlaps


class DetectPiiResponse(ApiModel):
    language: str  # the language the text was analyzed in: the locale's, or `en` when not loaded
    results: list[DetectedText]  # one per input text, in order


class MaskedText(ApiModel):
    text: str  # findings replaced by placeholders such as `[EMAIL]`
    findings: list[PiiFinding]  # positions refer to the original text


class MaskPiiResponse(ApiModel):
    language: str
    results: list[MaskedText]
