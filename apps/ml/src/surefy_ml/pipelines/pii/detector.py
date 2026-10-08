# SPDX-License-Identifier: AGPL-3.0-only
"""PiiDetector protocol and language handling; no library imports here."""

from collections.abc import Sequence
from typing import Protocol

from surefy_ml.schemas.pii import CustomPattern, PiiFinding, PiiType

# Languages with a loaded NLP model. Other locales are analyzed as the default language: the
# pattern-based types work everywhere, only names depend on the language model.
SUPPORTED_LANGUAGES: tuple[str, ...] = ("en",)
DEFAULT_LANGUAGE = "en"


def resolve_language(locale: str) -> str:
    """`en-US` and `en_GB` become `en`; a language without a model becomes the default."""
    language = locale.replace("_", "-").split("-", 1)[0].lower()
    return language if language in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


class PiiDetector(Protocol):
    def detect(
        self,
        texts: Sequence[str],
        *,
        language: str,
        types: Sequence[PiiType],
        custom_patterns: Sequence[CustomPattern],
    ) -> list[list[PiiFinding]]:
        """Findings per text, in text order and without overlaps."""
        ...

    def warm_up(self) -> None:
        """Loads the language models, so the first request is not slow."""
        ...
