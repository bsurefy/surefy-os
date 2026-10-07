# SPDX-License-Identifier: AGPL-3.0-only
"""Error classes: one subclass per code in the API contract."""

from typing import ClassVar, Self

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

    def __reduce__(self) -> tuple[object, ...]:
        # Errors raised in a worker process are pickled back; subclasses have their own
        # constructor signatures, so rebuild from the attributes instead of calling them.
        return (_rebuild, (type(self), self.message, self.details, self.meta))


def _rebuild(
    cls: type[MlError], message: str, details: list[ErrorDetail], meta: dict[str, object]
) -> MlError:
    error = cls.__new__(cls)
    Exception.__init__(error, message)
    error.message = message
    error.details = details
    error.meta = meta
    return error


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


class UnsupportedFileError(MlError):
    code = "ML_UNSUPPORTED_FILE"
    status_code = 422
    retryable = False

    def __init__(self, mime_type: str, *, reason: str = "unsupported type") -> None:
        super().__init__(
            f"Cannot process file ({reason}): {mime_type}",
            meta={"mimeType": mime_type, "reason": reason},
        )


class FileTooLargeError(MlError):
    code = "ML_FILE_TOO_LARGE"
    status_code = 413
    retryable = False

    @classmethod
    def bytes_over(cls, max_bytes: int) -> Self:
        return cls(
            f"File exceeds the size limit of {max_bytes} bytes", meta={"maxBytes": max_bytes}
        )

    @classmethod
    def pages_over(cls, pages: int, max_pages: int) -> Self:
        return cls(
            f"File has {pages} pages, over the limit of {max_pages}",
            meta={"pages": pages, "maxPages": max_pages},
        )


class FileDownloadError(MlError):
    code = "ML_FILE_DOWNLOAD_FAILED"
    status_code = 502
    retryable = True

    def __init__(self, reason: str, *, host: str = "") -> None:
        super().__init__(f"File could not be downloaded ({reason})", meta={"host": host})


class OperationTimeoutError(MlError):
    code = "ML_TIMEOUT"
    status_code = 504
    retryable = True  # once; the backend treats a second timeout on the same input as final

    def __init__(self, operation: str = "operation") -> None:
        super().__init__(f"Processing exceeded the {operation} timeout")


class ParseTimeoutError(OperationTimeoutError):
    def __init__(self) -> None:
        super().__init__("parse")


class BusyError(MlError):
    code = "ML_BUSY"
    status_code = 503
    retryable = True

    def __init__(self) -> None:
        super().__init__("All workers are busy; retry later")


class NotReadyError(MlError):
    code = "ML_NOT_READY"
    status_code = 503
    retryable = True

    def __init__(self) -> None:
        super().__init__("Models are still loading")
