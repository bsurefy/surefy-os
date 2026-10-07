# SPDX-License-Identifier: AGPL-3.0-only
"""DocumentParser protocol and the supported file types; no library imports here."""

from pathlib import Path
from typing import Protocol

from surefy_ml.schemas.documents import OcrMode, ParsedDocument

# MIME type → file suffix of the downloaded file (parsers detect the format from it).
SUPPORTED_MIME_TYPES: dict[str, str] = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "text/html": ".html",
    "application/xhtml+xml": ".xhtml",
    "text/markdown": ".md",
    "text/csv": ".csv",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/tiff": ".tiff",
    "image/bmp": ".bmp",
    "image/webp": ".webp",
}


class DocumentParser(Protocol):
    def parse(
        self, path: Path, mime_type: str, *, ocr: OcrMode, max_pages: int
    ) -> ParsedDocument: ...

    def warm_up(self) -> None:
        """Loads the models of the default OCR mode, so the first request is not slow."""
        ...
