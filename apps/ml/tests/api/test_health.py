# SPDX-License-Identifier: AGPL-3.0-only
from httpx import AsyncClient


async def test_live_needs_no_token(client: AsyncClient) -> None:
    response = await client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-request-id"]


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
