# SPDX-License-Identifier: AGPL-3.0-only
"""Health endpoints: the only routes without the service token."""

from fastapi import APIRouter

from surefy_ml.schemas.common import HealthStatus

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def live() -> HealthStatus:
    return HealthStatus(status="ok")


@router.get("/ready")
async def ready() -> HealthStatus:
    # Model loading and the worker pool add their own readiness checks.
    return HealthStatus(status="ok")
