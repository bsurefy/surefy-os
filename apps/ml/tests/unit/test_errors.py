# SPDX-License-Identifier: AGPL-3.0-only
import pickle

import pytest

from surefy_ml.core.errors import (
    FileTooLargeError,
    MlError,
    ParseTimeoutError,
    UnauthorizedError,
    UnsupportedFileError,
)


@pytest.mark.parametrize(
    "error",
    [
        UnsupportedFileError("application/x-foo", reason="damaged or encrypted"),
        FileTooLargeError.pages_over(30, 10),
        ParseTimeoutError(),
        UnauthorizedError(),
        MlError("Unexpected failure"),
    ],
)
def test_errors_survive_the_trip_back_from_a_worker(error: MlError) -> None:
    copy = pickle.loads(pickle.dumps(error))  # noqa: S301  # our own bytes
    assert type(copy) is type(error)
    assert (copy.code, copy.status_code, copy.message, copy.meta) == (
        error.code,
        error.status_code,
        error.message,
        error.meta,
    )
