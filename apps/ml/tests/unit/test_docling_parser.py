# SPDX-License-Identifier: AGPL-3.0-only
"""DoclingParser with the real library and models on the sample documents."""

import os
import shutil
from pathlib import Path

import pytest

from surefy_ml.core.errors import FileTooLargeError, UnsupportedFileError
from surefy_ml.pipelines.parsing.docling_parser import DoclingParser
from surefy_ml.schemas.documents import OcrMode, ParsedDocument
from tests.conftest import FIXTURES

pytestmark = pytest.mark.slow

# Download once: uv run docling-tools models download layout tableformer rapidocr -o .models
MODELS_DIR = Path(os.environ.get("ML_TEST_MODELS_DIR", Path(__file__).parents[2] / ".models"))
PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
PARAGRAPH = "Every workspace keeps its documents in knowledge bases that chat can cite."
TABLE = [["Plan", "Seats"], ["Team", "10"], ["Business", "50"]]


@pytest.fixture(scope="module")
def parser() -> DoclingParser:
    if not MODELS_DIR.is_dir():
        if os.environ.get("CI"):  # CI downloads the weights first; a skip there would hide it
            pytest.fail(f"models not downloaded to {MODELS_DIR}")
        pytest.skip(f"models not downloaded to {MODELS_DIR}")
    return DoclingParser(models_dir=MODELS_DIR, device="cpu", document_timeout_seconds=120)


def parse(
    parser: DoclingParser,
    name: str,
    mime_type: str,
    ocr: OcrMode = OcrMode.AUTO,
    max_pages: int = 50,
) -> ParsedDocument:
    return parser.parse(FIXTURES / name, mime_type, ocr=ocr, max_pages=max_pages)


def texts(parsed: ParsedDocument) -> str:
    return "\n".join(section.text for section in parsed.sections)


def test_text_pdf_keeps_pages_and_headings(parser: DoclingParser) -> None:
    parsed = parse(parser, "text.pdf", PDF)
    assert parsed.pages == 2
    assert not parsed.used_ocr
    paragraph = next(s for s in parsed.sections if s.text == PARAGRAPH)
    assert paragraph.heading_path[-1] == "Getting started"
    assert (paragraph.page_from, paragraph.page_to) == (1, 1)
    assert any(s.page_from == 2 for s in parsed.sections)


def test_scanned_pdf_uses_ocr(parser: DoclingParser) -> None:
    parsed = parse(parser, "scanned.pdf", PDF)
    assert parsed.used_ocr
    assert "invoice number 4711" in texts(parsed).lower()


def test_ocr_off_skips_scanned_pages(parser: DoclingParser) -> None:
    parsed = parse(parser, "scanned.pdf", PDF, ocr=OcrMode.OFF)
    assert not parsed.used_ocr
    assert "4711" not in texts(parsed)


def test_docx_has_title_headings_and_table(parser: DoclingParser) -> None:
    parsed = parse(parser, "sample.docx", DOCX)
    assert parsed.title == "Surefy Sample Handbook"
    assert parsed.sections[0].heading_path == ["Surefy Sample Handbook", "Getting started"]
    assert parsed.sections[0].page_from is None
    assert parsed.tables[0].rows == TABLE


def test_xlsx_becomes_a_table(parser: DoclingParser) -> None:
    assert parse(parser, "sample.xlsx", XLSX).tables[0].rows == TABLE


def test_pptx_slide_text(parser: DoclingParser) -> None:
    assert PARAGRAPH in texts(parse(parser, "sample.pptx", PPTX))


def test_html_has_headings_and_table(parser: DoclingParser) -> None:
    parsed = parse(parser, "sample.html", "text/html")
    assert parsed.sections[0].heading_path[-1] == "Getting started"
    assert parsed.tables[0].rows == TABLE


def test_page_limit(parser: DoclingParser) -> None:
    with pytest.raises(FileTooLargeError):
        parse(parser, "text.pdf", PDF, max_pages=1)


def test_content_must_match_the_type(parser: DoclingParser) -> None:
    with pytest.raises(UnsupportedFileError):
        parse(parser, "sample.html", PDF)


def test_damaged_pdf_is_unsupported(parser: DoclingParser, tmp_path: Path) -> None:
    broken = tmp_path / "broken.pdf"
    shutil.copy(FIXTURES / "text.pdf", broken)
    broken.write_bytes(broken.read_bytes()[:200])
    with pytest.raises(UnsupportedFileError):
        parser.parse(broken, PDF, ocr=OcrMode.AUTO, max_pages=50)
