# SPDX-License-Identifier: AGPL-3.0-only
"""PII tasks: module-level functions that run inside a worker process."""

from collections.abc import Sequence

from surefy_ml.models.registry import worker_registry
from surefy_ml.schemas.pii import CustomPattern, PiiFinding, PiiType


def detect_pii_task(
    texts: Sequence[str],
    *,
    language: str,
    types: Sequence[PiiType],
    custom_patterns: Sequence[CustomPattern],
) -> list[list[PiiFinding]]:
    return (
        worker_registry()
        .pii_detector()
        .detect(texts, language=language, types=types, custom_patterns=custom_patterns)
    )
