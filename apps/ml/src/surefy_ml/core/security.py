# SPDX-License-Identifier: AGPL-3.0-only
"""Service-token verification between the backend and this service."""

import hmac

from pydantic import SecretStr


def verify_service_token(presented: str, expected: SecretStr) -> bool:
    """Constant-time comparison; the token is never logged."""
    return hmac.compare_digest(presented.encode(), expected.get_secret_value().encode())
