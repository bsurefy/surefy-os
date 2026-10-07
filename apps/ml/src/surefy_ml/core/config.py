# SPDX-License-Identifier: AGPL-3.0-only
"""Settings from ML_ environment variables; the only place that reads the environment."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ML_", frozen=True, extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    log_level: Literal["debug", "info", "warning", "error"] = "info"

    service_token: SecretStr = Field(min_length=32)
    allowed_download_hosts: list[str]  # JSON list of host[:port] of signed URLs
    max_file_bytes: int = Field(default=100 * 1024 * 1024, gt=0)
    max_pages: int = Field(default=2000, gt=0)
    parse_timeout_seconds: int = Field(default=600, gt=0)
    download_timeout_seconds: int = Field(default=60, gt=0)

    workers: int = Field(default=2, ge=1)  # size of the CPU process pool
    queue_timeout_seconds: int = Field(default=30, ge=0)
    max_concurrent_per_org: int = Field(default=2, ge=1)

    models_dir: Path = Path("/models")  # pre-downloaded weights (volume or image)
    device: Literal["cpu", "cuda"] = "cpu"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # values come from the environment
