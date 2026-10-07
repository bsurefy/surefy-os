# SPDX-License-Identifier: AGPL-3.0-only
"""The real process pool (spawned workers, no models)."""

import asyncio
import os
from collections.abc import AsyncGenerator, Callable
from functools import partial
from uuid import uuid4

import pytest

from surefy_ml.core.concurrency import WorkerPool
from surefy_ml.core.errors import (
    BusyError,
    NotReadyError,
    OperationTimeoutError,
    ParseTimeoutError,
    UnsupportedFileError,
)
from tests.unit import pool_tasks

type PoolFactory = Callable[..., WorkerPool]


@pytest.fixture
async def make_pool() -> AsyncGenerator[PoolFactory]:
    pools: list[WorkerPool] = []

    def make(**options: object) -> WorkerPool:
        settings: dict[str, object] = {
            "workers": 1,
            "max_concurrent_per_org": 2,
            "queue_timeout_seconds": 0.2,
            "initializer": pool_tasks.noop,
            "warm_up": pool_tasks.noop,
        } | options
        pool = WorkerPool(**settings)  # pyright: ignore[reportArgumentType]
        pools.append(pool)
        return pool

    yield make
    for pool in pools:
        await pool.close()


async def started(pool: WorkerPool) -> WorkerPool:
    pool.start()
    async with asyncio.timeout(30):
        while not pool.ready:  # noqa: ASYNC110  # the pool exposes no event; tests only
            await asyncio.sleep(0.05)
    return pool


async def test_runs_tasks_in_another_process(make_pool: PoolFactory) -> None:
    pool = await started(make_pool())
    assert await pool.run(pool_tasks.pid, org_id=uuid4(), timeout=10) != os.getpid()


async def test_refuses_work_until_warmed_up(make_pool: PoolFactory) -> None:
    pool = make_pool()
    with pytest.raises(NotReadyError):
        await pool.run(pool_tasks.noop, org_id=uuid4(), timeout=10)


async def test_failed_warm_up_keeps_the_pool_not_ready(make_pool: PoolFactory) -> None:
    pool = make_pool(warm_up=pool_tasks.fail_warm_up)
    pool.start()
    await asyncio.sleep(3)
    assert not pool.ready


async def test_worker_errors_keep_their_class(make_pool: PoolFactory) -> None:
    pool = await started(make_pool())
    with pytest.raises(UnsupportedFileError) as caught:
        await pool.run(pool_tasks.fail, org_id=uuid4(), timeout=10)
    assert caught.value.meta["reason"] == "damaged or encrypted"


async def test_saturated_pool_is_busy(make_pool: PoolFactory) -> None:
    pool = await started(make_pool())
    slow = asyncio.create_task(pool.run(partial(pool_tasks.sleep, 1), org_id=uuid4(), timeout=10))
    await asyncio.sleep(0.1)
    with pytest.raises(BusyError):
        await pool.run(pool_tasks.noop, org_id=uuid4(), timeout=10)
    assert await slow == 1


async def test_one_organization_cannot_take_every_worker(make_pool: PoolFactory) -> None:
    pool = await started(make_pool(workers=2, max_concurrent_per_org=1))
    org = uuid4()
    slow = asyncio.create_task(pool.run(partial(pool_tasks.sleep, 1), org_id=org, timeout=10))
    await asyncio.sleep(0.1)
    with pytest.raises(BusyError):
        await pool.run(pool_tasks.noop, org_id=org, timeout=10)
    await pool.run(pool_tasks.noop, org_id=uuid4(), timeout=10)  # another org still gets one
    await slow


async def test_timeout_replaces_the_worker(make_pool: PoolFactory) -> None:
    pool = await started(make_pool())
    before = await pool.run(pool_tasks.pid, org_id=uuid4(), timeout=10)
    with pytest.raises(ParseTimeoutError):
        await pool.run(
            partial(pool_tasks.sleep, 30),
            org_id=uuid4(),
            timeout=0.5,
            on_timeout=ParseTimeoutError,
        )
    after = await pool.run(pool_tasks.pid, org_id=uuid4(), timeout=30)
    assert after != before


async def test_default_timeout_error(make_pool: PoolFactory) -> None:
    pool = await started(make_pool())
    with pytest.raises(OperationTimeoutError):
        await pool.run(partial(pool_tasks.sleep, 30), org_id=uuid4(), timeout=0.5)
