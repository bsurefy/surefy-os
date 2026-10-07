# SPDX-License-Identifier: AGPL-3.0-only
"""WorkerPool: CPU-bound tasks in worker processes, with per-org caps, timeouts and replacement.

Each slot is a single-process executor, so a task that times out can be stopped by killing its
own process and replacing the slot, without touching the tasks running in the other slots.
"""

import asyncio
import multiprocessing
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from typing import Protocol
from uuid import UUID

from surefy_ml.core.errors import BusyError, MlError, NotReadyError, OperationTimeoutError
from surefy_ml.core.logging import get_logger

log = get_logger()


class TaskRunner(Protocol):
    """What services need from the pool; API tests use an in-process fake."""

    @property
    def ready(self) -> bool: ...

    async def run[T](
        self,
        task: Callable[[], T],
        *,
        org_id: UUID,
        timeout: float,
        on_timeout: Callable[[], MlError] = OperationTimeoutError,
    ) -> T: ...


class _OrgLimiter:
    """At most `limit` running tasks per organization; idle entries are dropped."""

    def __init__(self, limit: int) -> None:
        self._limit = limit
        self._semaphores: dict[UUID, asyncio.Semaphore] = {}
        self._users: dict[UUID, int] = {}

    def enter(self, org_id: UUID) -> asyncio.Semaphore:
        self._users[org_id] = self._users.get(org_id, 0) + 1
        return self._semaphores.setdefault(org_id, asyncio.Semaphore(self._limit))

    def leave(self, org_id: UUID) -> None:
        self._users[org_id] -= 1
        if self._users[org_id] == 0:
            del self._users[org_id]
            del self._semaphores[org_id]


class WorkerPool:
    def __init__(
        self,
        *,
        workers: int,
        max_concurrent_per_org: int,
        queue_timeout_seconds: float,
        initializer: Callable[..., None],
        initargs: tuple[object, ...] = (),
        warm_up: Callable[[], None] | None = None,
    ) -> None:
        self._workers = workers
        self._queue_timeout = queue_timeout_seconds
        self._initializer = initializer
        self._initargs = initargs
        self._warm_up = warm_up
        self._orgs = _OrgLimiter(max_concurrent_per_org)
        self._idle: asyncio.Queue[ProcessPoolExecutor] = asyncio.Queue()
        self._all: set[ProcessPoolExecutor] = set()
        self._ready = False
        self._warm_up_task: asyncio.Task[None] | None = None

    @property
    def ready(self) -> bool:
        return self._ready

    def start(self) -> None:
        """Starts the slots and warms each worker up in the background; `ready` turns true after."""
        executors = [self._new_executor() for _ in range(self._workers)]
        for executor in executors:
            self._idle.put_nowait(executor)
        self._warm_up_task = asyncio.create_task(self._warm(executors))

    async def close(self) -> None:
        if self._warm_up_task is not None:
            self._warm_up_task.cancel()
        for executor in self._all:
            self._kill(executor)
        self._all.clear()
        self._ready = False

    async def run[T](
        self,
        task: Callable[[], T],
        *,
        org_id: UUID,
        timeout: float,
        on_timeout: Callable[[], MlError] = OperationTimeoutError,
    ) -> T:
        if not self._ready:
            raise NotReadyError
        semaphore = self._orgs.enter(org_id)
        try:
            executor = await self._acquire(semaphore)
            try:
                return await self._submit(executor, task, timeout=timeout, on_timeout=on_timeout)
            finally:
                semaphore.release()
        finally:
            self._orgs.leave(org_id)

    async def _acquire(self, semaphore: asyncio.Semaphore) -> ProcessPoolExecutor:
        holds_org_slot = False
        try:
            async with asyncio.timeout(self._queue_timeout):
                await semaphore.acquire()
                holds_org_slot = True
                return await self._idle.get()
        except TimeoutError:
            if holds_org_slot:
                semaphore.release()
            log.warning("worker pool saturated")
            raise BusyError from None

    async def _submit[T](
        self,
        executor: ProcessPoolExecutor,
        task: Callable[[], T],
        *,
        timeout: float,
        on_timeout: Callable[[], MlError],
    ) -> T:
        try:
            return await asyncio.wait_for(asyncio.wrap_future(executor.submit(task)), timeout)
        except TimeoutError:
            log.warning("worker replaced after a timeout", timeoutSeconds=timeout)
            executor = self._replace(executor)
            raise on_timeout() from None
        except asyncio.CancelledError:
            # The caller went away; stop the work instead of letting it hold the slot.
            executor = self._replace(executor)
            raise
        except BrokenProcessPool as exc:
            log.error("worker process stopped unexpectedly", exc_info=exc)
            executor = self._replace(executor)
            raise MlError("Worker process stopped unexpectedly") from exc
        finally:
            self._idle.put_nowait(executor)

    def _new_executor(self) -> ProcessPoolExecutor:
        executor = ProcessPoolExecutor(
            max_workers=1,
            mp_context=multiprocessing.get_context("spawn"),
            initializer=self._initializer,
            initargs=self._initargs,
        )
        self._all.add(executor)
        return executor

    def _replace(self, executor: ProcessPoolExecutor) -> ProcessPoolExecutor:
        self._kill(executor)
        self._all.discard(executor)
        return self._new_executor()  # models load on its first task

    @staticmethod
    def _kill(executor: ProcessPoolExecutor) -> None:
        # Python 3.13 has no public way to stop a running task (3.14 adds kill_workers).
        processes = executor._processes or {}  # pyright: ignore[reportPrivateUsage]
        for process in list(processes.values()):
            process.kill()
        executor.shutdown(wait=False, cancel_futures=True)

    async def _warm(self, executors: list[ProcessPoolExecutor]) -> None:
        warm_up = self._warm_up
        if warm_up is not None:
            try:
                await asyncio.gather(
                    *(asyncio.wrap_future(executor.submit(warm_up)) for executor in executors)
                )
            except Exception as exc:
                log.error("worker warm-up failed", exc_info=exc)
                return
        self._ready = True
        log.info("worker pool ready", workers=len(executors))
