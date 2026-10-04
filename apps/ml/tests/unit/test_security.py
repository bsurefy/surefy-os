# SPDX-License-Identifier: AGPL-3.0-only
from pydantic import SecretStr

from surefy_ml.core.security import verify_service_token


def test_compares_tokens() -> None:
    secret = SecretStr("a" * 32)
    assert verify_service_token("a" * 32, secret)
    assert not verify_service_token("b" * 32, secret)
