# SPDX-License-Identifier: AGPL-3.0-only
"""Request dependencies: service-token check and request id."""

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from surefy_ml.core.config import Settings, get_settings
from surefy_ml.core.errors import UnauthorizedError
from surefy_ml.core.security import verify_service_token

bearer = HTTPBearer(auto_error=False)


async def require_service_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    if credentials is None or not verify_service_token(
        credentials.credentials, settings.service_token
    ):
        raise UnauthorizedError


def request_id(request: Request) -> str:
    value: object = getattr(request.state, "request_id", None)
    return value if isinstance(value, str) else ""
