# SPDX-License-Identifier: AGPL-3.0-only
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from surefy_ml.core.errors import BusyError, MlError, NotReadyError, ParseTimeoutError
from surefy_ml.schemas.documents import OcrMode
from tests.conftest import FILES_HOST, FIXTURES, FakeTaskRunner

PDF = "application/pdf"
URL = "/v1/documents/parse"


def body(name: str = "text.pdf", **overrides: Any) -> dict[str, Any]:
    return {"fileUrl": f"http://{FILES_HOST}/{name}", "mimeType": PDF, "orgId": str(uuid4())} | (
        overrides
    )


async def test_parse_requires_the_service_token(client: AsyncClient) -> None:
    response = await client.post(URL, json=body())
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "ML_UNAUTHORIZED"


async def test_parse_returns_the_document_in_camel_case(
    client: AsyncClient, auth_header: dict[str, str], runner: FakeTaskRunner
) -> None:
    request = body(ocr="force")
    response = await client.post(URL, json=request, headers=auth_header)

    assert response.status_code == 200
    assert response.json() == {
        "title": "Handbook",
        "language": None,
        "pages": 1,
        "sections": [],
        "tables": [],
        "usedOcr": False,
    }
    [call] = runner.calls
    assert call.path.suffix == ".pdf"
    assert call.content == (FIXTURES / "text.pdf").read_bytes()
    assert call.mime_type == PDF
    assert call.kwargs == {"ocr": OcrMode.FORCE, "max_pages": 100}
    assert str(call.org_id) == request["orgId"]
    assert not call.path.exists()  # the temp file is removed after the request


@pytest.mark.parametrize(("requested", "expected"), [(None, 100), (5, 5), (500, 100)])
async def test_max_pages_is_capped_by_the_setting(
    client: AsyncClient,
    auth_header: dict[str, str],
    runner: FakeTaskRunner,
    requested: int | None,
    expected: int,
) -> None:
    response = await client.post(URL, json=body(maxPages=requested), headers=auth_header)
    assert response.status_code == 200
    assert runner.calls[0].kwargs["max_pages"] == expected


async def test_invalid_body_lists_the_fields(
    client: AsyncClient, auth_header: dict[str, str]
) -> None:
    response = await client.post(
        URL, json={"fileUrl": "not a url", "mimeType": PDF, "extra": 1}, headers=auth_header
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "ML_VALIDATION_FAILED"
    assert {(detail["path"], detail["code"]) for detail in error["details"]} == {
        ("fileUrl", "url_parsing"),
        ("orgId", "missing"),
        ("extra", "extra_forbidden"),
    }


async def test_unknown_mime_type_is_unsupported(
    client: AsyncClient, auth_header: dict[str, str], runner: FakeTaskRunner
) -> None:
    response = await client.post(URL, json=body(mimeType="application/x-foo"), headers=auth_header)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ML_UNSUPPORTED_FILE"
    assert runner.calls == []


@pytest.mark.parametrize(
    ("file_url", "status", "code"),
    [
        ("http://elsewhere.test/text.pdf", 502, "ML_FILE_DOWNLOAD_FAILED"),
        (f"http://{FILES_HOST}/missing.pdf", 502, "ML_FILE_DOWNLOAD_FAILED"),
        (f"http://{FILES_HOST}/redirect", 502, "ML_FILE_DOWNLOAD_FAILED"),
        (f"http://{FILES_HOST}/big", 413, "ML_FILE_TOO_LARGE"),
    ],
)
async def test_download_failures(
    client: AsyncClient,
    auth_header: dict[str, str],
    runner: FakeTaskRunner,
    file_url: str,
    status: int,
    code: str,
) -> None:
    response = await client.post(URL, json=body(fileUrl=file_url), headers=auth_header)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert runner.calls == []


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (BusyError(), 503, "ML_BUSY"),
        (NotReadyError(), 503, "ML_NOT_READY"),
        (ParseTimeoutError(), 504, "ML_TIMEOUT"),
        (MlError("boom"), 500, "ML_INTERNAL_ERROR"),
    ],
)
async def test_worker_errors_use_their_codes(
    client: AsyncClient,
    auth_header: dict[str, str],
    runner: FakeTaskRunner,
    error: MlError,
    status: int,
    code: str,
) -> None:
    runner.error = error
    response = await client.post(URL, json=body(), headers=auth_header)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert not runner.calls[0].path.exists()
