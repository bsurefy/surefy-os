# SPDX-License-Identifier: AGPL-3.0-only
"""Shared wire models: camelCase on the wire, snake_case in Python."""

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
        frozen=True,
    )


class ErrorDetail(ApiModel):
    field: str | None = None
    message: str


class ErrorBody(ApiModel):
    code: str
    message: str
    request_id: str
    details: list[ErrorDetail] = Field(default_factory=list[ErrorDetail])


class ErrorEnvelope(ApiModel):
    error: ErrorBody


class HealthStatus(ApiModel):
    status: str
