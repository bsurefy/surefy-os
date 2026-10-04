# SPDX-License-Identifier: AGPL-3.0-only
"""Module-level tasks for the WorkerPool tests (spawned workers import them by name)."""

import os
import time

from surefy_ml.core.errors import UnsupportedFileError


def noop() -> None: ...


def pid() -> int:
    return os.getpid()


def sleep(seconds: float) -> float:
    time.sleep(seconds)
    return seconds


def fail() -> None:
    raise UnsupportedFileError("application/pdf", reason="damaged or encrypted")


def fail_warm_up() -> None:
    raise RuntimeError("models missing")
