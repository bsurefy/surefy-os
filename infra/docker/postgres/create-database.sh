#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Create one more development database on the running dev Postgres, set up like the default one.
# Usage: infra/docker/postgres/create-database.sh <name>   (in a worktree: the DATABASE_NAME from .env.worktree)
set -euo pipefail
db="${1:?usage: create-database.sh <name>}"
[[ "$db" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || { echo "invalid database name: $db" >&2; exit 1; }
compose="$(cd "$(dirname "$0")/.." && pwd)/compose.dev.yml"
docker compose -f "$compose" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres -v db="$db" -f /surefy/database.sql >/dev/null
echo "database $db is ready (owner surefy_owner, app role surefy_app, extension vector)"
