# SPDX-License-Identifier: AGPL-3.0-only
"""structlog setup: the same fields as the backend's Pino logs (msg, level, time, service)."""

import logging
import sys
from collections.abc import MutableMapping
from typing import Any, Literal

import structlog

# Safety net only: callers never pass these to the logger in the first place.
REDACTED_KEYS = frozenset({"fileUrl", "file_url", "authorization", "text", "content"})

LogLevel = Literal["debug", "info", "warning", "error"]


def _redact(
    _logger: object, _method: str, event: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    for key in REDACTED_KEYS & event.keys():
        event[key] = "[redacted]"
    return event


def _pino_fields(
    _logger: object, _method: str, event: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    event["service"] = "ml"
    if event.get("level") == "warning":
        event["level"] = "warn"  # Pino's label
    if "exception" in event:
        event["err"] = event.pop("exception")
    return event


def configure_logging(*, level: LogLevel, json: bool) -> None:
    """Configures structlog once per process (the API process and each worker process)."""
    renderer: structlog.typing.Processor = (
        structlog.processors.JSONRenderer() if json else structlog.dev.ConsoleRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True, key="time"),
            _redact,
            structlog.processors.dict_tracebacks if json else structlog.processors.format_exc_info,
            _pino_fields,
            structlog.processors.EventRenamer("msg"),
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelNamesMapping()[level.upper()]
        ),
        logger_factory=structlog.PrintLoggerFactory(sys.stdout),
        cache_logger_on_first_use=True,
    )


def get_logger() -> structlog.typing.FilteringBoundLogger:
    return structlog.get_logger()
