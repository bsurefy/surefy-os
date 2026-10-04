# SPDX-License-Identifier: AGPL-3.0-only
"""Health endpoints: the only routes without the service token."""

from typing import Annotated

from fastapi import APIRouter, Depends

from surefy_ml.api.deps import get_task_runner
from surefy_ml.core.concurrency import TaskRunner
from surefy_ml.core.errors import NotReadyError
from surefy_ml.schemas.common import ErrorEnvelope, HealthStatus

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def live() -> HealthStatus:
    return HealthStatus(status="ok")


@router.get("/ready", responses={503: {"model": ErrorEnvelope}})
async def ready(runner: Annotated[TaskRunner, Depends(get_task_runner)]) -> HealthStatus:
    # Ready once every worker process has loaded its models.
    if not runner.ready:
        raise NotReadyError
    return HealthStatus(status="ok")
