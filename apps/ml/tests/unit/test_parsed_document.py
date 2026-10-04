# SPDX-License-Identifier: AGPL-3.0-only
"""Docling document tree → our schema, on hand-built documents (no models)."""

from docling_core.types.doc.base import BoundingBox
from docling_core.types.doc.common.reference import ProvenanceItem
from docling_core.types.doc.document import DoclingDocument
from docling_core.types.doc.items.table.table_data import TableCell, TableData
from docling_core.types.doc.labels import DocItemLabel

from surefy_ml.pipelines.parsing.docling_parser import to_parsed_document


def on_page(page: int) -> ProvenanceItem:
    return ProvenanceItem(page_no=page, bbox=BoundingBox(l=0, t=0, r=1, b=1), charspan=(0, 1))


def parse(document: DoclingDocument):
    return to_parsed_document(document, pages=3, used_ocr=False)


def test_text_is_grouped_under_its_heading_path() -> None:
    doc = DoclingDocument(name="t")
    doc.add_title("Handbook", prov=on_page(1))
    doc.add_heading("Setup", level=1, prov=on_page(1))
    doc.add_text(DocItemLabel.TEXT, "Install it.", prov=on_page(1))
    doc.add_heading("Database", level=2, prov=on_page(2))
    doc.add_text(DocItemLabel.TEXT, "Use Postgres.", prov=on_page(2))
    doc.add_text(DocItemLabel.TEXT, "Back it up.", prov=on_page(3))
    doc.add_heading("Usage", level=1, prov=on_page(3))
    doc.add_list_item("Open chat", marker="1.", prov=on_page(3), parent=doc.add_list_group())

    parsed = parse(doc)

    assert parsed.title == "Handbook"
    assert [(s.heading_path, s.text, s.page_from, s.page_to) for s in parsed.sections] == [
        (["Handbook", "Setup"], "Install it.", 1, 1),
        (["Handbook", "Setup", "Database"], "Use Postgres.\n\nBack it up.", 2, 3),
        (["Handbook", "Usage"], "1. Open chat", 3, 3),
    ]


def test_a_heading_with_nothing_below_it_is_kept_as_text() -> None:
    doc = DoclingDocument(name="t")
    doc.add_heading("Invoice 4711", level=1, prov=on_page(1))
    doc.add_heading("Terms", level=1, prov=on_page(2))
    doc.add_text(DocItemLabel.TEXT, "Net 30.", prov=on_page(2))
    doc.add_heading("Signed", level=1, prov=on_page(3))

    sections = parse(doc).sections

    assert [(s.heading_path, s.text, s.page_from) for s in sections] == [
        ([], "Invoice 4711", 1),
        (["Terms"], "Net 30.", 2),
        ([], "Signed", 3),
    ]


def test_tables_keep_their_heading_path_and_cells() -> None:
    doc = DoclingDocument(name="t")
    doc.add_heading("Plans", level=1)
    cells = [
        TableCell(
            text=text,
            start_row_offset_idx=row,
            end_row_offset_idx=row + 1,
            start_col_offset_idx=col,
            end_col_offset_idx=col + 1,
        )
        for row, values in enumerate([["Plan", "Seats"], ["Team", "10"]])
        for col, text in enumerate(values)
    ]
    caption = doc.add_text(DocItemLabel.CAPTION, "Seats per plan")
    doc.add_table(TableData(table_cells=cells, num_rows=2, num_cols=2), caption=caption)

    parsed = parse(doc)

    [table] = parsed.tables
    assert table.heading_path == ["Plans"]
    assert table.caption == "Seats per plan"
    assert table.rows == [["Plan", "Seats"], ["Team", "10"]]
    assert table.page is None
    assert all(section.text != "Plans" for section in parsed.sections)  # the table is content
