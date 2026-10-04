# SPDX-License-Identifier: AGPL-3.0-only
"""Writes the OpenAPI contract to stdout.

Usage: uv run python -m surefy_ml.export_openapi > openapi.json
"""

import json
import sys

from pydantic import SecretStr

from surefy_ml.core.config import Settings
from surefy_ml.main import create_app


def main() -> None:
    settings = Settings(service_token=SecretStr("x" * 32), allowed_download_hosts=[])
    json.dump(create_app(settings).openapi(), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
