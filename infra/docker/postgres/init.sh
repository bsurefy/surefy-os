#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Runs once, when the Postgres volume is created: roles, then the default database.
set -euo pipefail
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -v owner_password="$SUREFY_OWNER_PASSWORD" -v app_password="$SUREFY_APP_PASSWORD" \
  -f /surefy/roles.sql
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -v db="$SUREFY_DATABASE" -f /surefy/database.sql
