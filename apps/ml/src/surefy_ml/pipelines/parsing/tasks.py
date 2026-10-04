# SPDX-License-Identifier: AGPL-3.0-only
"""Parsing tasks: module-level functions that run inside a worker process."""

from pathlib import Path

from surefy_ml.models.registry import worker_registry
from surefy_ml.schemas.documents import OcrMode, ParsedDocument


def parse_document_task(
    path: Path, mime_type: str, *, ocr: OcrMode, max_pages: int
) -> ParsedDocument:
    return worker_registry().document_parser().parse(path, mime_type, ocr=ocr, max_pages=max_pages)


def warm_up_task() -> None:
    worker_registry().document_parser().warm_up()
