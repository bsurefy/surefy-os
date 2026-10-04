# SPDX-License-Identifier: AGPL-3.0-only
"""Safe download of signed URLs: allowed hosts only, no redirects, size limit while streaming."""

import tempfile
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from pydantic import HttpUrl

from surefy_ml.core.errors import FileDownloadError, FileTooLargeError

CHUNK_BYTES = 64 * 1024


def _host_allowed(url: HttpUrl, allowed_hosts: frozenset[str]) -> bool:
    """An entry `host:port` matches that port only; an entry `host` matches any port."""
    host = (url.host or "").lower()
    return host in allowed_hosts or f"{host}:{url.port}" in allowed_hosts


class FileFetcher:
    def __init__(
        self,
        *,
        allowed_hosts: list[str],
        timeout_seconds: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._allowed_hosts = frozenset(entry.lower() for entry in allowed_hosts)
        self._client = httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(timeout_seconds, connect=min(timeout_seconds, 10.0)),
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    @asynccontextmanager
    async def download(
        self, url: HttpUrl, *, max_bytes: int, suffix: str = ""
    ) -> AsyncGenerator[Path]:
        """Yields the path of the downloaded file; the file is deleted when the block exits."""
        host = url.host or ""
        if not _host_allowed(url, self._allowed_hosts):
            raise FileDownloadError("host not allowed", host=host)
        with tempfile.TemporaryDirectory(prefix="surefy-ml-") as directory:
            path = Path(directory) / f"input{suffix}"
            await self._fetch(url, path, max_bytes=max_bytes, host=host)
            yield path

    async def _fetch(self, url: HttpUrl, path: Path, *, max_bytes: int, host: str) -> None:
        try:
            async with self._client.stream("GET", str(url)) as response:
                if response.is_redirect:
                    raise FileDownloadError("redirects are not followed", host=host)
                if not response.is_success:
                    raise FileDownloadError(f"status {response.status_code}", host=host)
                declared = response.headers.get("content-length")
                if declared is not None and declared.isdigit() and int(declared) > max_bytes:
                    raise FileTooLargeError.bytes_over(max_bytes)
                received = 0
                with path.open("wb") as file:
                    async for chunk in response.aiter_bytes(CHUNK_BYTES):
                        received += len(chunk)
                        if received > max_bytes:
                            raise FileTooLargeError.bytes_over(max_bytes)
                        file.write(chunk)
        except httpx.TimeoutException as exc:
            raise FileDownloadError("timeout", host=host) from exc
        except httpx.HTTPError as exc:
            raise FileDownloadError("network error", host=host) from exc
