# SPDX-License-Identifier: AGPL-3.0-only
"""Personal-data use cases: find it in texts, and replace it with placeholders."""

import time
from functools import partial

from surefy_ml.core.concurrency import TaskRunner
from surefy_ml.core.config import Settings
from surefy_ml.core.logging import get_logger
from surefy_ml.pipelines.pii.detector import resolve_language
from surefy_ml.pipelines.pii.findings import mask_text
from surefy_ml.pipelines.pii.tasks import detect_pii_task
from surefy_ml.schemas.pii import (
    DetectedText,
    DetectPiiResponse,
    MaskedText,
    MaskPiiResponse,
    PiiFinding,
    PiiRequest,
    PiiType,
)

log = get_logger()


class PiiService:
    def __init__(self, runner: TaskRunner, settings: Settings) -> None:
        self._runner = runner
        self._settings = settings

    async def detect(self, request: PiiRequest) -> DetectPiiResponse:
        language, findings = await self._find(request)
        return DetectPiiResponse(
            language=language, results=[DetectedText(findings=found) for found in findings]
        )

    async def mask(self, request: PiiRequest) -> MaskPiiResponse:
        language, findings = await self._find(request)
        return MaskPiiResponse(
            language=language,
            results=[
                MaskedText(text=mask_text(text, found), findings=found)
                for text, found in zip(request.texts, findings, strict=True)
            ],
        )

    async def _find(self, request: PiiRequest) -> tuple[str, list[list[PiiFinding]]]:
        language = resolve_language(request.locale)
        types = list(PiiType) if request.types is None else list(dict.fromkeys(request.types))
        if not types and not request.custom_patterns:
            return language, [[] for _ in request.texts]
        started = time.perf_counter()
        task = partial(
            detect_pii_task,
            request.texts,
            language=language,
            types=types,
            custom_patterns=request.custom_patterns,
        )
        findings = await self._runner.run(
            task, org_id=request.org_id, timeout=self._settings.pii_timeout_seconds
        )
        # Counts only: the texts and what was found in them never reach the logs.
        log.info(
            "personal data analyzed",
            texts=len(request.texts),
            characters=sum(len(text) for text in request.texts),
            findings=sum(len(found) for found in findings),
            durationMs=round((time.perf_counter() - started) * 1000),
        )
        return language, findings
