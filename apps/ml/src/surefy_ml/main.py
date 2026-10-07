# SPDX-License-Identifier: AGPL-3.0-only
"""Application factory: uvicorn surefy_ml.main:create_app --factory."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from surefy_ml.api.errors import register_error_handlers
from surefy_ml.api.routers import documents, health
from surefy_ml.core.concurrency import TaskRunner, WorkerPool
from surefy_ml.core.config import Settings, get_settings
from surefy_ml.core.files import FileFetcher
from surefy_ml.core.logging import configure_logging, get_logger
from surefy_ml.models.registry import WorkerConfig, init_worker
from surefy_ml.pipelines.parsing.tasks import warm_up_task
from surefy_ml.services.documents_service import DocumentsService


def create_app(
    settings: Settings | None = None,
    *,
    task_runner: TaskRunner | None = None,
    download_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    """`task_runner` and `download_transport` replace the process pool and the network in tests."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        config = settings or get_settings()
        json_logs = config.env == "production"
        configure_logging(level=config.log_level, json=json_logs)
        pool: WorkerPool | None = None
        runner = task_runner
        if runner is None:
            pool = WorkerPool(
                workers=config.workers,
                max_concurrent_per_org=config.max_concurrent_per_org,
                queue_timeout_seconds=config.queue_timeout_seconds,
                initializer=init_worker,
                initargs=(
                    WorkerConfig(
                        models_dir=config.models_dir,
                        device=config.device,
                        parse_timeout_seconds=config.parse_timeout_seconds,
                        log_level=config.log_level,
                        json_logs=json_logs,
                    ),
                ),
                warm_up=warm_up_task,
            )
            pool.start()
            runner = pool
        files = FileFetcher(
            allowed_hosts=config.allowed_download_hosts,
            timeout_seconds=config.download_timeout_seconds,
            transport=download_transport,
        )
        app.state.task_runner = runner
        app.state.documents_service = DocumentsService(files, runner, config)
        get_logger().info("ml service started", env=config.env, workers=config.workers)
        try:
            yield
        finally:
            await files.aclose()
            if pool is not None:
                await pool.close()

    app = FastAPI(
        title="SurefyOS ML service",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )
    if settings is not None:
        app.dependency_overrides[get_settings] = lambda: settings
    register_error_handlers(app)
    app.include_router(health.router)
    app.include_router(documents.router)
    return app
