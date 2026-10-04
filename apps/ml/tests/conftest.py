# SPDX-License-Identifier: AGPL-3.0-only
from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from surefy_ml.core.config import Settings
from surefy_ml.main import create_app

TOKEN = "test-token-" + "x" * 32


@pytest.fixture
def settings() -> Settings:
    return Settings(env="test", service_token=SecretStr(TOKEN), allowed_download_hosts=[])


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://ml") as http:
        yield http


@pytest.fixture
def auth_header() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}
