# SPDX-License-Identifier: AGPL-3.0-only
"""DocumentParser on docling, with RapidOCR for scanned pages."""

import math
from dataclasses import dataclass
from pathlib import Path

from docling.datamodel.accelerator_options import AcceleratorOptions
from docling.datamodel.base_models import ConversionStatus, InputFormat
from docling.datamodel.document import ConversionResult
from docling.datamodel.pipeline_options import OcrMode as DoclingOcrMode
from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions
from docling.document_converter import DocumentConverter, ImageFormatOption, PdfFormatOption
from docling.exceptions import ConversionError
from docling_core.types.doc.document import DoclingDocument
from docling_core.types.doc.items.node import DocItem
from docling_core.types.doc.items.table.table import TableItem
from docling_core.types.doc.items.text import ListItem, SectionHeaderItem, TextItem, TitleItem

from surefy_ml.core.errors import FileTooLargeError, ParseTimeoutError, UnsupportedFileError
from surefy_ml.schemas.documents import DocumentSection, DocumentTable, OcrMode, ParsedDocument

FORMATS: dict[str, InputFormat] = {
    "application/pdf": InputFormat.PDF,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": InputFormat.DOCX,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": InputFormat.XLSX,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": InputFormat.PPTX,
    "text/html": InputFormat.HTML,
    "application/xhtml+xml": InputFormat.HTML,
    "text/markdown": InputFormat.MD,
    "text/csv": InputFormat.CSV,
    "image/png": InputFormat.IMAGE,
    "image/jpeg": InputFormat.IMAGE,
    "image/tiff": InputFormat.IMAGE,
    "image/bmp": InputFormat.IMAGE,
    "image/webp": InputFormat.IMAGE,
}
_DONE = (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS)


class DoclingParser:
    def __init__(self, *, models_dir: Path, device: str, document_timeout_seconds: float) -> None:
        self._models_dir = models_dir
        self._device = device
        self._document_timeout = document_timeout_seconds
        self._converters: dict[OcrMode, DocumentConverter] = {}

    def warm_up(self) -> None:
        self._converter(OcrMode.AUTO).initialize_pipeline(InputFormat.PDF)

    def parse(self, path: Path, mime_type: str, *, ocr: OcrMode, max_pages: int) -> ParsedDocument:
        expected = FORMATS.get(mime_type)
        if expected is None:
            raise UnsupportedFileError(mime_type)
        try:
            result = self._converter(ocr).convert(
                path, raises_on_error=False, max_num_pages=max_pages
            )
        except ConversionError as exc:
            raise UnsupportedFileError(mime_type, reason="unreadable") from exc
        if result.input.page_count > max_pages:
            raise FileTooLargeError.pages_over(result.input.page_count, max_pages)
        if result.input.format != expected:
            raise UnsupportedFileError(mime_type, reason="content does not match the type")
        if result.has_timeout_errors():
            raise ParseTimeoutError
        if result.status not in _DONE:
            raise UnsupportedFileError(mime_type, reason="damaged or encrypted")
        return to_parsed_document(
            result.document, pages=result.input.page_count, used_ocr=_used_ocr(result)
        )

    def _converter(self, ocr: OcrMode) -> DocumentConverter:
        converter = self._converters.get(ocr)
        if converter is None:
            options = self._pdf_options(ocr)
            converter = DocumentConverter(
                allowed_formats=sorted(set(FORMATS.values())),
                format_options={
                    InputFormat.PDF: PdfFormatOption(pipeline_options=options),
                    InputFormat.IMAGE: ImageFormatOption(pipeline_options=options),
                },
            )
            self._converters[ocr] = converter
        return converter

    def _pdf_options(self, ocr: OcrMode) -> PdfPipelineOptions:
        return PdfPipelineOptions(
            artifacts_path=self._models_dir,
            document_timeout=self._document_timeout,
            accelerator_options=AcceleratorOptions(device=self._device),
            do_table_structure=True,
            do_ocr=ocr != OcrMode.OFF,
            ocr_options=RapidOcrOptions(
                # DEFAULT reads only the regions without a text layer; FULL_PAGE reads every page.
                mode=DoclingOcrMode.FULL_PAGE if ocr == OcrMode.FORCE else DoclingOcrMode.DEFAULT
            ),
        )


def _used_ocr(result: ConversionResult) -> bool:
    return any(not math.isnan(page.ocr_score) for page in result.confidence.pages.values())


def _pages(item: DocItem) -> list[int]:
    return [prov.page_no for prov in item.prov]


@dataclass
class _Heading:
    level: int  # 0 for the title
    text: str
    pages: list[int]
    has_content: bool = False  # text, a table or a sub-heading below it


class _SectionBuilder:
    """Groups body text under its heading path; a heading with nothing below it becomes text."""

    def __init__(self) -> None:
        self.sections: list[DocumentSection] = []
        self._headings: list[_Heading] = []
        self._texts: list[str] = []
        self._pages: list[int] = []

    def path(self) -> list[str]:
        return [heading.text for heading in self._headings]

    def heading(self, level: int, text: str, pages: list[int]) -> None:
        self._flush()
        while self._headings and self._headings[-1].level >= level:
            self._close(self._headings.pop())
        if self._headings:
            self._headings[-1].has_content = True
        self._headings.append(_Heading(level, text, pages))

    def text(self, text: str, pages: list[int]) -> None:
        self._mark_content()
        self._texts.append(text)
        self._pages.extend(pages)

    def table(self) -> None:
        self._mark_content()

    def finish(self) -> list[DocumentSection]:
        self._flush()
        while self._headings:
            self._close(self._headings.pop())
        return self.sections

    def _mark_content(self) -> None:
        if self._headings:
            self._headings[-1].has_content = True

    def _close(self, heading: _Heading) -> None:
        if not heading.has_content:
            self._add(heading.text, heading.pages)

    def _flush(self) -> None:
        if self._texts:
            self._add("\n\n".join(self._texts), self._pages)
        self._texts = []
        self._pages = []

    def _add(self, text: str, pages: list[int]) -> None:
        self.sections.append(
            DocumentSection(
                heading_path=self.path(),
                text=text,
                page_from=min(pages, default=None),
                page_to=max(pages, default=None),
            )
        )


def to_parsed_document(document: DoclingDocument, *, pages: int, used_ocr: bool) -> ParsedDocument:
    """Docling's document tree → our schema: text grouped under its heading path, and tables."""
    title: str | None = None
    builder = _SectionBuilder()
    tables: list[DocumentTable] = []

    for item, _level in document.iterate_items():
        if not isinstance(item, (TextItem, TableItem)):
            continue
        if isinstance(item, TableItem):
            builder.table()
            tables.append(
                DocumentTable(
                    heading_path=builder.path(),
                    caption=item.caption_text(document).strip() or None,
                    rows=[[cell.text for cell in row] for row in item.data.grid],
                    page=min(_pages(item), default=None),
                )
            )
            continue
        text = item.text.strip()
        if not text:
            continue
        if isinstance(item, TitleItem):
            title = title or text
            builder.heading(0, text, _pages(item))
        elif isinstance(item, SectionHeaderItem):
            builder.heading(item.level, text, _pages(item))
        else:
            builder.text(
                f"{item.marker or '-'} {text}" if isinstance(item, ListItem) else text, _pages(item)
            )

    return ParsedDocument(
        title=title,
        language=None,  # docling does not detect the language
        pages=pages,
        sections=builder.finish(),
        tables=tables,
        used_ocr=used_ocr,
    )
