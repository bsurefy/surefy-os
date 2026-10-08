# SPDX-License-Identifier: AGPL-3.0-only
from collections.abc import AsyncGenerator, Callable
from dataclasses import dataclass, field
from functools import partial
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

import surefy_ml.main as main_module
from surefy_ml.core.config import Settings
from surefy_ml.core.errors import BusyError, MlError, OperationTimeoutError, PatternTooSlowError
from surefy_ml.main import create_app
from surefy_ml.models.registry import WorkerConfig, init_worker
from surefy_ml.schemas.pii import PiiFinding, PiiFindingType, PiiType

DETECT = "/v1/pii/detect"
MASK = "/v1/pii/mask"


def email(start: int, end: int) -> PiiFinding:
    return PiiFinding(type=PiiFindingType.EMAIL, custom_label=None, start=start, end=end, score=1.0)


@dataclass
class PiiCall:
    texts: list[str]
    kwargs: dict[str, Any]
    org_id: UUID
    timeout: float


@dataclass
class FakePiiRunner:
    """Records the detection task instead of running it in a worker process."""

    ready: bool = True
    result: list[list[PiiFinding]] = field(default_factory=list[list[PiiFinding]])
    error: MlError | None = None
    calls: list[PiiCall] = field(default_factory=list[PiiCall])

    async def run[T](
        self,
        task: Callable[[], T],
        *,
        org_id: UUID,
        timeout: float,
        on_timeout: Callable[[], MlError] = OperationTimeoutError,
    ) -> T:
        call = cast("partial[T]", task)
        self.calls.append(
            PiiCall(list(cast("list[str]", call.args[0])), dict(call.keywords), org_id, timeout)
        )
        if self.error is not None:
            raise self.error
        return cast("T", self.result)


@pytest.fixture
def pii_runner() -> FakePiiRunner:
    return FakePiiRunner()


@pytest.fixture
async def pii(settings: Settings, pii_runner: FakePiiRunner) -> AsyncGenerator[AsyncClient]:
    app = create_app(settings, task_runner=pii_runner)
    async with (
        LifespanManager(app) as manager,
        AsyncClient(transport=ASGITransport(app=manager.app), base_url="http://ml") as http,
    ):
        yield http


def body(**overrides: Any) -> dict[str, Any]:
    return {"texts": ["Write to ana@example.com"], "orgId": str(uuid4())} | overrides


@pytest.mark.parametrize("url", [DETECT, MASK])
async def test_requires_the_service_token(pii: AsyncClient, url: str) -> None:
    response = await pii.post(url, json=body())
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "ML_UNAUTHORIZED"


async def test_detect_returns_the_positions_but_not_the_text(
    pii: AsyncClient,
    auth_header: dict[str, str],
    pii_runner: FakePiiRunner,
    settings: Settings,
) -> None:
    pii_runner.result = [[email(9, 24)], []]
    request = body(texts=["Write to ana@example.com", "Nothing here"], locale="en-GB")

    response = await pii.post(DETECT, json=request, headers=auth_header)

    assert response.status_code == 200
    assert response.json() == {
        "language": "en",
        "results": [
            {
                "findings": [
                    {"type": "email", "customLabel": None, "start": 9, "end": 24, "score": 1.0}
                ]
            },
            {"findings": []},
        ],
    }
    [call] = pii_runner.calls
    assert call.texts == request["texts"]
    assert call.kwargs["language"] == "en"
    assert call.kwargs["types"] == list(PiiType)  # absent means every built-in type
    assert call.timeout == settings.pii_timeout_seconds
    assert str(call.org_id) == request["orgId"]


async def test_mask_replaces_the_findings_and_keeps_their_positions(
    pii: AsyncClient, auth_header: dict[str, str], pii_runner: FakePiiRunner
) -> None:
    pii_runner.result = [[email(9, 24)]]

    response = await pii.post(MASK, json=body(), headers=auth_header)

    assert response.status_code == 200
    [result] = response.json()["results"]
    assert result["text"] == "Write to [EMAIL]"
    assert result["findings"][0]["start"] == 9


async def test_the_selected_types_and_custom_patterns_reach_the_detector(
    pii: AsyncClient, auth_header: dict[str, str], pii_runner: FakePiiRunner
) -> None:
    pii_runner.result = [[]]
    patterns = [{"label": " Employee ID ", "pattern": r"EMP-\d{5}"}]

    response = await pii.post(
        DETECT,
        json=body(types=["email", "email", "phone"], customPatterns=patterns),
        headers=auth_header,
    )

    assert response.status_code == 200
    [call] = pii_runner.calls
    assert call.kwargs["types"] == [PiiType.EMAIL, PiiType.PHONE]
    [pattern] = call.kwargs["custom_patterns"]
    assert (pattern.label, pattern.pattern) == ("Employee ID", r"EMP-\d{5}")


async def test_nothing_to_look_for_skips_the_worker(
    pii: AsyncClient, auth_header: dict[str, str], pii_runner: FakePiiRunner
) -> None:
    response = await pii.post(MASK, json=body(types=[]), headers=auth_header)

    assert response.status_code == 200
    assert response.json()["results"] == [{"text": "Write to ana@example.com", "findings": []}]
    assert pii_runner.calls == []


@pytest.mark.parametrize(
    ("overrides", "path"),
    [
        ({"texts": []}, "texts"),
        ({"texts": [""]}, "texts.0"),
        ({"texts": ["x"] * 101}, "texts"),
        ({"texts": ["x" * 100_001]}, "texts.0"),
        ({"types": ["passport"]}, "types.0"),
        ({"types": ["custom"]}, "types.0"),
        ({"locale": "e"}, "locale"),
        ({"customPatterns": [{"label": "ID", "pattern": "(unclosed"}]}, "customPatterns.0.pattern"),
        ({"customPatterns": [{"label": "ID", "pattern": "x" * 501}]}, "customPatterns.0.pattern"),
        ({"customPatterns": [{"label": " ", "pattern": "x"}]}, "customPatterns.0.label"),
        (
            {
                "customPatterns": [
                    {"label": "Staff ID", "pattern": "a"},
                    {"label": "staff id", "pattern": "b"},
                ]
            },
            "customPatterns",
        ),
    ],
)
async def test_invalid_requests_list_the_fields(
    pii: AsyncClient,
    auth_header: dict[str, str],
    pii_runner: FakePiiRunner,
    overrides: dict[str, Any],
    path: str,
) -> None:
    response = await pii.post(DETECT, json=body(**overrides), headers=auth_header)

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "ML_VALIDATION_FAILED"
    assert path in [detail["path"] for detail in error["details"]]
    assert pii_runner.calls == []


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (PatternTooSlowError(2), 422, "ML_VALIDATION_FAILED"),
        (OperationTimeoutError("operation"), 504, "ML_TIMEOUT"),
        (BusyError(), 503, "ML_BUSY"),
    ],
)
async def test_failures_use_the_error_envelope(
    pii: AsyncClient,
    auth_header: dict[str, str],
    pii_runner: FakePiiRunner,
    error: MlError,
    status: int,
    code: str,
) -> None:
    pii_runner.error = error

    response = await pii.post(DETECT, json=body(), headers=auth_header)

    assert response.status_code == status
    assert response.json()["error"]["code"] == code


async def test_a_pattern_that_is_too_slow_names_the_pattern(
    pii: AsyncClient, auth_header: dict[str, str], pii_runner: FakePiiRunner
) -> None:
    pii_runner.error = PatternTooSlowError(1)

    response = await pii.post(MASK, json=body(), headers=auth_header)

    [detail] = response.json()["error"]["details"]
    assert (detail["path"], detail["code"]) == ("customPatterns.1.pattern", "pattern_too_slow")


async def test_the_routes_are_not_mounted_without_the_pii_extra(
    settings: Settings, auth_header: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(main_module, "pii_available", lambda: False)
    app: FastAPI = create_app(settings, task_runner=FakePiiRunner())
    async with (
        LifespanManager(app) as manager,
        AsyncClient(transport=ASGITransport(app=manager.app), base_url="http://ml") as http,
    ):
        response = await http.post(DETECT, json=body(), headers=auth_header)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ML_NOT_FOUND"


@dataclass
class InlineRunner:
    """Runs the task in this process, after the same initializer a worker process runs."""

    ready: bool = True

    async def run[T](
        self,
        task: Callable[[], T],
        *,
        org_id: UUID,
        timeout: float,
        on_timeout: Callable[[], MlError] = OperationTimeoutError,
    ) -> T:
        return task()


@pytest.mark.slow
async def test_mask_end_to_end_with_the_real_detector(
    settings: Settings, auth_header: dict[str, str]
) -> None:
    init_worker(
        WorkerConfig(
            models_dir=settings.models_dir,
            device="cpu",
            parse_timeout_seconds=settings.parse_timeout_seconds,
            log_level="warning",
            json_logs=False,
            pii_min_score=settings.pii_min_score,
            pii_pattern_timeout_seconds=settings.pii_pattern_timeout_seconds,
        )
    )
    app = create_app(settings, task_runner=InlineRunner())
    async with (
        LifespanManager(app) as manager,
        AsyncClient(transport=ASGITransport(app=manager.app), base_url="http://ml") as http,
    ):
        response = await http.post(
            MASK,
            json=body(
                texts=[
                    "Maria Garcia: maria.garcia@example.com, badge EMP-48213, "
                    "card 4111 1111 1111 1111"
                ],
                types=["person_name", "email", "payment_card"],
                customPatterns=[{"label": "Badge", "pattern": r"EMP-\d{5}"}],
            ),
            headers=auth_header,
        )

    assert response.status_code == 200
    [result] = response.json()["results"]
    assert result["text"] == "[PERSON_NAME]: [EMAIL], badge [BADGE], card [PAYMENT_CARD]"
    assert sorted(item["type"] for item in result["findings"]) == [
        "custom",
        "email",
        "payment_card",
        "person_name",
    ]
