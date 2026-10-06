#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Backs up a running self-hosted install into one folder: the Postgres dump, the files volume
# (uploads, avatars, exports) and the .env that holds the keys. Run it from cron or by hand.
#
#   infra/scripts/backup.sh [<backup-dir>]       # default ./backups; creates surefy-backup-<time>/
#
# The folder holds secrets (.env): store it somewhere private, off this server.
set -euo pipefail

die() {
  echo "backup.sh: $*" >&2
  exit 1
}

docker_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../docker" && pwd)"
env_file="$docker_dir/.env"
[ -f "$env_file" ] || die "$env_file not found: is SurefyOS installed here?"

command -v docker >/dev/null || die "Docker is not installed"

compose() {
  docker compose -f "$docker_dir/compose.selfhost.yml" --project-directory "$docker_dir" "$@"
}

database="$(grep '^SUREFY_DATABASE=' "$env_file" | cut -d= -f2-)"
database="${database:-surefy}"

compose ps --status running --services | grep -qx postgres || die "the postgres service is not running"

root="${1:-./backups}"
mkdir -p "$root"
target="$(cd "$root" && pwd)/surefy-backup-$(date -u +%Y%m%dT%H%M%SZ)"
umask 077
mkdir "$target"

# A failed backup leaves nothing that looks like a good one.
trap 'rm -rf "$target"' ERR

echo "Dumping the database"
compose exec -T postgres pg_dump -U postgres --format=custom "$database" >"$target/database.dump"

echo "Archiving the files volume"
compose run --rm --no-deps -T -v "$target:/backup" --user 0 --entrypoint tar files-permissions \
  -czf /backup/files.tar.gz -C /data/storage .

cp "$env_file" "$target/env"

trap - ERR
echo "Backup written to $target"
echo "  database.dump  files.tar.gz  env"
