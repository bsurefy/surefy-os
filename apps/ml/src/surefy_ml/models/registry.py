# SPDX-License-Identifier: AGPL-3.0-only
"""Per-process model registry: builds library objects once per worker process and reuses them."""

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from surefy_ml.core.logging import LogLevel, configure_logging
from surefy_ml.pipelines.parsing.parser import DocumentParser


@dataclass(frozen=True)
class WorkerConfig:
    """What a worker process needs; plain values, so it pickles into spawned processes."""

    models_dir: Path
    device: Literal["cpu", "cuda"]
    parse_timeout_seconds: int
    log_level: LogLevel
    json_logs: bool


class ModelRegistry:
    def __init__(self, config: WorkerConfig) -> None:
        self._config = config
        self._document_parser: DocumentParser | None = None

    def document_parser(self) -> DocumentParser:
        if self._document_parser is None:
            # Imported here: docling is heavy and only worker processes need it.
            from surefy_ml.pipelines.parsing.docling_parser import DoclingParser  # noqa: PLC0415

            self._document_parser = DoclingParser(
                models_dir=self._config.models_dir,
                device=self._config.device,
                # Slightly below the operation timeout, so docling usually stops cleanly first.
                document_timeout_seconds=self._config.parse_timeout_seconds * 0.9,
            )
        return self._document_parser


_registry: ModelRegistry | None = None


def init_worker(config: WorkerConfig) -> None:
    """Initializer of every worker process."""
    global _registry  # noqa: PLW0603  # one registry per process, by design
    configure_logging(level=config.log_level, json=config.json_logs)
    _registry = ModelRegistry(config)


def worker_registry() -> ModelRegistry:
    if _registry is None:
        raise RuntimeError("init_worker has not run in this process")
    return _registry
