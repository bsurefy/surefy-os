# SPDX-License-Identifier: AGPL-3.0-only
"""Exception handlers: every error leaves the service in the shared error envelope."""

import re
import uuid
from collections.abc import Awaitable, Callable
from typing import cast

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from surefy_ml.api.deps import request_id
from surefy_ml.core.errors import MlError
from surefy_ml.schemas.common import ErrorBody, ErrorDetail, ErrorEnvelope

REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
NOT_FOUND = 404


def _envelope(
    request: Request, status: int, code: str, message: str, details: list[ErrorDetail]
) -> JSONResponse:
    body = ErrorEnvelope(
        error=ErrorBody(code=code, message=message, request_id=request_id(request), details=details)
    )
    return JSONResponse(status_code=status, content=body.model_dump(by_alias=True))


async def _ml_error(request: Request, exc: Exception) -> Response:
    error = exc if isinstance(exc, MlError) else MlError("Unexpected failure")
    return _envelope(request, error.status_code, error.code, error.message, error.details)


async def _validation_error(request: Request, exc: Exception) -> Response:
    errors = (
        cast("list[dict[str, object]]", exc.errors())
        if isinstance(exc, RequestValidationError)
        else []
    )
    details = [
        ErrorDetail(
            field=".".join(str(part) for part in cast("tuple[object, ...]", error.get("loc", ()))),
            message=str(error.get("msg", "")),
        )
        for error in errors
    ]
    return _envelope(request, 422, "ML_VALIDATION_FAILED", "Request validation failed", details)


async def _http_error(request: Request, exc: Exception) -> Response:
    status = exc.status_code if isinstance(exc, HTTPException) else 500
    if status == NOT_FOUND:
        return _envelope(request, NOT_FOUND, "ML_NOT_FOUND", "Not found", [])
    return _envelope(request, status, "ML_INTERNAL_ERROR", "Unexpected failure", [])


async def _unexpected_error(request: Request, _exc: Exception) -> Response:
    return _envelope(request, 500, "ML_INTERNAL_ERROR", "Unexpected failure", [])


async def _request_id_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    presented = request.headers.get("x-request-id", "")
    value = presented if REQUEST_ID_PATTERN.match(presented) else str(uuid.uuid4())
    request.state.request_id = value
    response = await call_next(request)
    response.headers["x-request-id"] = value
    return response


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(MlError, _ml_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(HTTPException, _http_error)
    app.add_exception_handler(Exception, _unexpected_error)
    app.middleware("http")(_request_id_middleware)
