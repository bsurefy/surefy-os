# SPDX-License-Identifier: AGPL-3.0-only
from collections.abc import AsyncGenerator, Callable
from dataclasses import dataclass, field
from functools import partial
from pathlib import Path
from typing import Any, cast
from uuid import UUID

import httpx
import pytest
from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from surefy_ml.core.config import Settings
from surefy_ml.core.errors import MlError, OperationTimeoutError
from surefy_ml.main import create_app
from surefy_ml.schemas.documents import ParsedDocument

TOKEN = "test-token-" + "x" * 32
FILES_HOST = "files.test"
MAX_FILE_BYTES = 1024 * 1024
FIXTURES = Path(__file__).parent / "fixtures" / "documents"


@dataclass
class TaskCall:
    path: Path
    mime_type: str
    kwargs: dict[str, Any]
    org_id: UUID
    content: bytes  # the downloaded file, read while the task runs


@dataclass
class FakeTaskRunner:
    """In-process stand-in for the WorkerPool: records the task instead of running it."""

    ready: bool = True
    result: ParsedDocument = field(
        default_factory=lambda: ParsedDocument(
            title="Handbook", language=None, pages=1, sections=[], tables=[], used_ocr=False
        )
    )
    error: MlError | None = None
    calls: list[TaskCall] = field(default_factory=list[TaskCall])

    async def run[T](
        self,
        task: Callable[[], T],
        *,
        org_id: UUID,
        timeout: float,
        on_timeout: Callable[[], MlError] = OperationTimeoutError,
    ) -> T:
        call = cast("partial[T]", task)
        path = cast("Path", call.args[0])
        self.calls.append(
            TaskCall(
                path, cast("str", call.args[1]), dict(call.keywords), org_id, path.read_bytes()
            )
        )
        if self.error is not None:
            raise self.error
        return cast("T", self.result)


async def _over_the_limit() -> AsyncGenerator[bytes]:
    yield b"x" * MAX_FILE_BYTES
    yield b"x"


def _file_server(request: httpx.Request) -> httpx.Response:
    """Serves the fixtures at http://files.test/<name>, plus a few failure routes."""
    name = request.url.path.lstrip("/")
    if name == "redirect":
        return httpx.Response(302, headers={"location": f"http://{FILES_HOST}/text.pdf"})
    if name == "big":  # streamed without a length, over max_file_bytes
        return httpx.Response(200, content=_over_the_limit())
    path = FIXTURES / name
    if not name or not path.is_file():
        return httpx.Response(404)
    return httpx.Response(200, content=path.read_bytes())


@pytest.fixture
def settings() -> Settings:
    return Settings(
        env="test",
        service_token=SecretStr(TOKEN),
        allowed_download_hosts=[FILES_HOST],
        max_file_bytes=MAX_FILE_BYTES,
        max_pages=100,
    )


@pytest.fixture
def runner() -> FakeTaskRunner:
    return FakeTaskRunner()


@pytest.fixture
def app(settings: Settings, runner: FakeTaskRunner) -> FastAPI:
    return create_app(
        settings, task_runner=runner, download_transport=httpx.MockTransport(_file_server)
    )


@pytest.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient]:
    async with (
        LifespanManager(app) as manager,
        AsyncClient(transport=ASGITransport(app=manager.app), base_url="http://ml") as http,
    ):
        yield http


@pytest.fixture
def auth_header() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}
