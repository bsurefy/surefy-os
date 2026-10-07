# SPDX-License-Identifier: AGPL-3.0-only
# SurefyOS ML service, CPU image. Build context: apps/ml.
#   docker build -f infra/docker/ml.Dockerfile apps/ml
# Model weights are downloaded at build time, so the container works offline.

FROM ghcr.io/astral-sh/uv:0.12.23 AS uv

FROM python:3.13.13-slim-trixie AS base
# RapidOCR depends on the full opencv-python, which loads X11 and GL libraries even headless.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libxcb1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable

FROM build AS models
RUN /app/.venv/bin/docling-tools models download layout tableformer rapidocr -o /models

FROM base
RUN useradd --system --uid 10001 --no-create-home surefy
COPY --from=build /app/.venv /app/.venv
COPY --from=models /models /models
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    HF_HUB_OFFLINE=1 \
    ML_ENV=production \
    ML_MODELS_DIR=/models
USER surefy
EXPOSE 8000
CMD ["uvicorn", "surefy_ml.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
