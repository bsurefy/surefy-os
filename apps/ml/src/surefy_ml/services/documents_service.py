# SPDX-License-Identifier: AGPL-3.0-only
"""Document parsing use case: check the request, download the file, parse it in a worker."""

import time
from functools import partial

from surefy_ml.core.concurrency import TaskRunner
from surefy_ml.core.config import Settings
from surefy_ml.core.errors import ParseTimeoutError, UnsupportedFileError
from surefy_ml.core.files import FileFetcher
from surefy_ml.core.logging import get_logger
from surefy_ml.pipelines.parsing.parser import SUPPORTED_MIME_TYPES
from surefy_ml.pipelines.parsing.tasks import parse_document_task
from surefy_ml.schemas.documents import ParsedDocument, ParseDocumentRequest

log = get_logger()


class DocumentsService:
    def __init__(self, files: FileFetcher, runner: TaskRunner, settings: Settings) -> None:
        self._files = files
        self._runner = runner
        self._settings = settings

    async def parse(self, request: ParseDocumentRequest) -> ParsedDocument:
        suffix = SUPPORTED_MIME_TYPES.get(request.mime_type)
        if suffix is None:
            raise UnsupportedFileError(request.mime_type)
        limit = self._settings.max_pages
        max_pages = min(request.max_pages or limit, limit)
        started = time.perf_counter()
        async with self._files.download(
            request.file_url, max_bytes=self._settings.max_file_bytes, suffix=suffix
        ) as path:
            task = partial(
                parse_document_task, path, request.mime_type, ocr=request.ocr, max_pages=max_pages
            )
            parsed = await self._runner.run(
                task,
                org_id=request.org_id,
                timeout=self._settings.parse_timeout_seconds,
                on_timeout=ParseTimeoutError,
            )
        log.info(
            "document parsed",
            pages=parsed.pages,
            sections=len(parsed.sections),
            tables=len(parsed.tables),
            usedOcr=parsed.used_ocr,
            durationMs=round((time.perf_counter() - started) * 1000),
        )
        return parsed
