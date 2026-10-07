# SPDX-License-Identifier: AGPL-3.0-only
from httpx import AsyncClient

from tests.conftest import FakeTaskRunner


async def test_live_needs_no_token(client: AsyncClient) -> None:
    response = await client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-request-id"]


async def test_ready_waits_for_the_workers(client: AsyncClient, runner: FakeTaskRunner) -> None:
    runner.ready = False
    response = await client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "ML_NOT_READY"

    runner.ready = True
    response = await client.get("/health/ready")
    assert response.status_code == 200


async def test_unknown_route_uses_the_error_envelope(client: AsyncClient) -> None:
    response = await client.get("/v1/nothing", headers={"x-request-id": "req_123"})
    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "ML_NOT_FOUND",
            "message": "Not found",
            "requestId": "req_123",
            "details": [],
        }
    }


async def test_wrong_method_is_not_found_with_its_status(client: AsyncClient) -> None:
    response = await client.get("/v1/documents/parse")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "ML_NOT_FOUND"
