# SPDX-License-Identifier: AGPL-3.0-only
"""Error classes: one subclass per code in the API contract."""

from typing import ClassVar

from surefy_ml.schemas.common import ErrorDetail


class MlError(Exception):
    code: ClassVar[str] = "ML_INTERNAL_ERROR"
    status_code: ClassVar[int] = 500
    retryable: ClassVar[bool] = True

    def __init__(
        self,
        message: str,
        *,
        details: list[ErrorDetail] | None = None,
        meta: dict[str, object] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or []
        self.meta = meta or {}  # logged, never returned


class UnauthorizedError(MlError):
    code = "ML_UNAUTHORIZED"
    status_code = 401
    retryable = False

    def __init__(self) -> None:
        super().__init__("Missing or invalid service token")


class NotFoundError(MlError):
    code = "ML_NOT_FOUND"
    status_code = 404
    retryable = False
