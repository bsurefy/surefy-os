# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from pydantic import HttpUrl

from surefy_ml.core.files import _host_allowed  # pyright: ignore[reportPrivateUsage]

ALLOWED = frozenset({"minio:9000", "api"})


@pytest.mark.parametrize(
    ("url", "allowed"),
    [
        ("http://minio:9000/bucket/a.pdf", True),
        ("http://minio:9001/bucket/a.pdf", False),
        ("http://minio/bucket/a.pdf", False),
        ("http://api:4000/files/a.pdf", True),
        ("https://API/files/a.pdf", True),
        ("http://api.evil.test/a.pdf", False),
        ("http://user@minio:9000@evil.test/a.pdf", False),
    ],
)
def test_host_must_be_allowed(url: str, allowed: bool) -> None:
    assert _host_allowed(HttpUrl(url), ALLOWED) is allowed
