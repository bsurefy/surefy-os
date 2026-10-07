# SPDX-License-Identifier: AGPL-3.0-only
"""Document parsing: request and response models of /v1/documents."""

from enum import StrEnum
from uuid import UUID

from pydantic import Field, HttpUrl

from surefy_ml.schemas.common import ApiModel


class OcrMode(StrEnum):
    AUTO = "auto"  # OCR only pages without a text layer
    FORCE = "force"  # OCR every page
    OFF = "off"


class ParseDocumentRequest(ApiModel):
    file_url: HttpUrl
    mime_type: str = Field(min_length=1, max_length=255)
    org_id: UUID
    ocr: OcrMode = OcrMode.AUTO
    max_pages: int | None = Field(default=None, ge=1)  # capped by ML_MAX_PAGES


class DocumentSection(ApiModel):
    heading_path: list[str]  # headings above the text, outermost first
    text: str
    page_from: int | None  # 1-based; null for formats without pages (DOCX, HTML…)
    page_to: int | None


class DocumentTable(ApiModel):
    heading_path: list[str]
    caption: str | None
    rows: list[list[str]]  # cell text, row by row; spanning cells repeat their text
    page: int | None


class ParsedDocument(ApiModel):
    title: str | None
    language: str | None  # BCP-47 when known
    pages: int  # 0 for formats without pages
    sections: list[DocumentSection]
    tables: list[DocumentTable]
    used_ocr: bool
