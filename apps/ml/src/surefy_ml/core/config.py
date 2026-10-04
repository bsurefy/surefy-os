# SPDX-License-Identifier: AGPL-3.0-only
"""Settings from ML_ environment variables; the only place that reads the environment."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ML_", frozen=True, extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    log_level: Literal["debug", "info", "warning", "error"] = "info"

    service_token: SecretStr = Field(min_length=32)
    allowed_download_hosts: list[str]  # JSON list of host[:port] of signed URLs


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # values come from the environment
