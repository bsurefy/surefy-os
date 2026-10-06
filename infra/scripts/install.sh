#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Installs SurefyOS on this server with Docker Compose: writes infra/docker/.env with generated
# secrets, starts Postgres, runs the migrations, then starts the stack. Safe to run again: an
# existing .env is kept, and the steps that follow (pull, migrate, start) simply repeat.
#
#   infra/scripts/install.sh --domain surefy.example.com
#   infra/scripts/install.sh --domain surefy.example.com --build     # build the images from this checkout
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: install.sh [--domain <host>] [--build] [--no-start]

  --domain <host>  The host name people open (surefy.example.com). Its DNS record must point to
                   this server, and ports 80 and 443 must be reachable. Asked for when omitted.
  --build          Build the images from this checkout instead of pulling them.
  --no-start       Write .env and stop; start later with docker compose.

Environment: SUREFY_DOMAIN (same as --domain), SUREFY_IMAGE_REGISTRY, SUREFY_VERSION.
EOF
}

die() {
  echo "install.sh: $*" >&2
  exit 1
}

docker_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../docker" && pwd)"
env_file="$docker_dir/.env"
domain="${SUREFY_DOMAIN:-}"
build=false
start=true

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)
      [ $# -ge 2 ] || die "--domain needs a host name"
      domain="$2"
      shift 2
      ;;
    --build)
      build=true
      shift
      ;;
    --no-start)
      start=false
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

command -v docker >/dev/null || die "Docker is not installed"
docker compose version >/dev/null 2>&1 || die "the Docker Compose plugin is not installed"
command -v openssl >/dev/null || die "openssl is not installed"

compose() {
  docker compose -f "$docker_dir/compose.selfhost.yml" --project-directory "$docker_dir" "$@"
}

if [ -f "$env_file" ]; then
  echo "Keeping the existing $env_file"
else
  if [ -z "$domain" ]; then
    [ -t 0 ] || die "pass --domain <host>"
    read -r -p "Host name for this install (for example surefy.example.com): " domain
  fi
  case "$domain" in
    '' | *[!A-Za-z0-9.-]* | .* | *.) die "'$domain' is not a host name (letters, digits, dots and hyphens)" ;;
  esac

  hex() { openssl rand -hex "$1"; }
  postgres_password="$(hex 24)"
  owner_password="$(hex 24)"
  app_password="$(hex 24)"
  database="surefy"
  setup_token="$(hex 16)"

  # The file holds every secret of the install: readable by its owner only.
  (
    umask 077
    cat >"$env_file" <<EOF
# Written by infra/scripts/install.sh. Keep it private and keep a copy: ENCRYPTION_KEY protects
# the provider keys stored in Vault, and losing it makes them unreadable.

SUREFY_DOMAIN=$domain
APP_ORIGIN=https://$domain
API_PUBLIC_URL=https://$domain
# Docker's private address ranges: Caddy reaches the API from one of them.
TRUST_PROXY=172.16.0.0/12,10.0.0.0/8,192.168.0.0/16

# Images: SUREFY_VERSION is the release to run (a tag, for example 0.1.0).
SUREFY_IMAGE_REGISTRY=${SUREFY_IMAGE_REGISTRY:-ghcr.io/bsurefy}
SUREFY_VERSION=${SUREFY_VERSION:-latest}

# Secrets
AUTH_SECRET=$(hex 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
SETUP_TOKEN=$setup_token
ML_SERVICE_TOKEN=$(hex 32)

# Database: two roles, one that owns the schema (migrations) and one the application uses.
POSTGRES_PASSWORD=$postgres_password
SUREFY_DATABASE=$database
SUREFY_OWNER_PASSWORD=$owner_password
SUREFY_APP_PASSWORD=$app_password
DATABASE_URL=postgresql://surefy_app:$app_password@postgres:5432/$database
DATABASE_MIGRATION_URL=postgresql://surefy_owner:$owner_password@postgres:5432/$database

# Optional, add below and run 'docker compose up -d' again:
# MAIL_DRIVER=smtp (with MAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD)
# STORAGE_DRIVER=s3 (with STORAGE_S3_BUCKET, STORAGE_S3_ENDPOINT, STORAGE_S3_ACCESS_KEY_ID, STORAGE_S3_SECRET_ACCESS_KEY)
# OAUTH_GOOGLE_CLIENT_ID, OAUTH_GOOGLE_CLIENT_SECRET (also Microsoft and GitHub)
EOF
  )
  echo "Wrote $env_file"
fi

if [ "$start" = false ]; then
  echo "Start the stack with: docker compose -f $docker_dir/compose.selfhost.yml up -d"
  exit 0
fi

if [ "$build" = true ]; then
  compose build
else
  compose pull --ignore-buildable
fi

echo "Starting the database"
compose up -d --wait postgres redis
echo "Running the migrations"
compose run --rm migrate
echo "Starting SurefyOS"
compose up -d --wait

app_origin="$(grep '^APP_ORIGIN=' "$env_file" | cut -d= -f2-)"
setup_token="$(grep '^SETUP_TOKEN=' "$env_file" | cut -d= -f2-)"
cat <<EOF

SurefyOS is running.
  Open:         $app_origin
  Setup token:  $setup_token

The first visit opens the guided setup, which creates your organization and its owner.
Back up infra/docker/.env together with the data: infra/scripts/backup.sh
EOF
