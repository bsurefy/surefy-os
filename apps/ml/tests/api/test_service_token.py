# SPDX-License-Identifier: AGPL-3.0-only
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from httpx import AsyncClient

from surefy_ml.api.deps import require_service_token


@pytest.fixture
def app(app: FastAPI) -> FastAPI:
    @app.get("/v1/probe")
    async def probe(_: Annotated[None, Depends(require_service_token)]) -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]
        return {"ok": "yes"}

    return app


async def test_missing_token_is_rejected(client: AsyncClient) -> None:
    response = await client.get("/v1/probe")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "ML_UNAUTHORIZED"


async def test_wrong_token_is_rejected(client: AsyncClient) -> None:
    response = await client.get("/v1/probe", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401


async def test_valid_token_passes(client: AsyncClient, auth_header: dict[str, str]) -> None:
    response = await client.get("/v1/probe", headers=auth_header)
    assert response.status_code == 200
