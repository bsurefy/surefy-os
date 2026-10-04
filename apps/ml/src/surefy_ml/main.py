# SPDX-License-Identifier: AGPL-3.0-only
"""Application factory: uvicorn surefy_ml.main:create_app --factory."""

from fastapi import FastAPI

from surefy_ml.api.errors import register_error_handlers
from surefy_ml.api.routers import health
from surefy_ml.core.config import Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="SurefyOS ML service", version="0.0.0", docs_url=None, redoc_url=None)
    if settings is not None:
        app.dependency_overrides[get_settings] = lambda: settings
    register_error_handlers(app)
    app.include_router(health.router)
    return app
