#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Installs SurefyOS on this server with Docker Compose: writes infra/docker/.env with generated
# secrets, starts Postgres, runs the migrations, then starts the stack. Safe to run again: an
# existing .env is kept, and the steps that follow (pull, migrate, start) simply repeat.
#
#   infra/scripts/install.sh --domain surefy.example.com                       # HTTPS, ports 80 and 443
#   infra/scripts/install.sh --domain surefy.example.com --http                # plain HTTP
#   infra/scripts/install.sh --public-url https://surefy.example.com           # behind your own proxy
#   infra/scripts/install.sh --domain surefy.example.com --build               # build the images here
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: install.sh (--domain <host> | --public-url <url>) [options]

Address (one of these; asked for when both are omitted):
  --domain <host>     The host name people open (surefy.example.com). SurefyOS serves HTTPS and
                      gets the certificate itself: the DNS record must point to this server and
                      ports 80 and 443 must be reachable from the internet.
  --public-url <url>  The address people open when your own proxy (nginx, Traefik, a cloud load
                      balancer) does the HTTPS and forwards to SurefyOS over plain HTTP, for
                      example https://surefy.example.com. Plain HTTP is served on --http-port
                      (default 8080), on the local machine only unless you pass --bind.

Options:
  --http              With --domain: serve plain HTTP, with no certificate (a trial on a private
                      network). The address is http://<host>[:<http-port>].
  --http-port <n>     Host port for HTTP (default 80; 8080 with --public-url).
  --https-port <n>    Host port for HTTPS (default 443). Certificates from a public authority are
                      issued over ports 80 and 443 only: use another port only with your own
                      forwarding or with a private network name.
  --bind <address>    Host address the ports are published on (default 0.0.0.0, every interface;
                      127.0.0.1 with --public-url).
  --build             Build the images from this checkout instead of pulling them.
  --no-start          Write .env and stop; start later with docker compose.

Environment: SUREFY_DOMAIN (same as --domain), SUREFY_IMAGE_REGISTRY, SUREFY_VERSION.
EOF
}

die() {
  echo "install.sh: $*" >&2
  exit 1
}

check_port() {
  case "$2" in
    '' | *[!0-9]*) die "$1 must be a number" ;;
  esac
  [ "$2" -ge 1 ] && [ "$2" -le 65535 ] || die "$1 must be between 1 and 65535"
}

docker_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../docker" && pwd)"
env_file="$docker_dir/.env"
domain="${SUREFY_DOMAIN:-}"
public_url=""
plain=false
http_port=""
https_port=""
bind=""
build=false
start=true

while [ $# -gt 0 ]; do
  case "$1" in
    --domain | --public-url | --http-port | --https-port | --bind)
      [ $# -ge 2 ] || die "$1 needs a value"
      case "$1" in
        --domain) domain="$2" ;;
        --public-url) public_url="$2" ;;
        --http-port) http_port="$2" ;;
        --https-port) https_port="$2" ;;
        --bind) bind="$2" ;;
      esac
      shift 2
      ;;
    --http)
      plain=true
      shift
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
  [ -z "$public_url" ] || [ "$plain" = false ] || die "--http is for --domain; --public-url already means plain HTTP behind your proxy"
  if [ -z "$domain" ] && [ -z "$public_url" ]; then
    [ -t 0 ] || die "pass --domain <host> or --public-url <url>"
    read -r -p "Host name for this install (for example surefy.example.com): " domain
  fi

  # mode: tls (SurefyOS serves HTTPS), http (plain HTTP) or proxy (plain HTTP behind your proxy)
  if [ -n "$public_url" ]; then
    mode=proxy
    public_url="${public_url%/}"
    [[ "$public_url" =~ ^(https?)://([A-Za-z0-9.-]+)(:([0-9]+))?$ ]] ||
      die "--public-url must look like https://surefy.example.com (scheme, host, optional port, no path)"
    domain="${BASH_REMATCH[2]}"
    public_host="$domain${BASH_REMATCH[3]}"
    [ -z "$https_port" ] || die "--https-port does not apply with --public-url"
    : "${http_port:=8080}"
    : "${bind:=127.0.0.1}"
  else
    case "$domain" in
      '' | *[!A-Za-z0-9.-]* | .* | *.) die "'$domain' is not a host name (letters, digits, dots and hyphens)" ;;
    esac
    if [ "$plain" = true ]; then
      mode=http
      [ -z "$https_port" ] || die "--https-port does not apply with --http"
    else
      mode=tls
    fi
    : "${http_port:=80}"
    : "${bind:=0.0.0.0}"
  fi
  : "${https_port:=443}"
  check_port --http-port "$http_port"
  check_port --https-port "$https_port"
  case "$bind" in
    '' | *[!0-9A-Fa-f.:]*) die "--bind must be an IP address" ;;
  esac

  case "$mode" in
    tls)
      suffix=""
      [ "$https_port" = 443 ] || suffix=":$https_port"
      app_origin="https://$domain$suffix"
      public_host="$domain$suffix"
      site_address="$domain"
      profile=tls
      ;;
    http)
      suffix=""
      [ "$http_port" = 80 ] || suffix=":$http_port"
      app_origin="http://$domain$suffix"
      public_host="$domain$suffix"
      site_address=":$http_port"
      profile=http
      ;;
    proxy)
      app_origin="$public_url"
      site_address=":$http_port"
      profile=http
      ;;
  esac

  hex() { openssl rand -hex "$1"; }
  postgres_password="$(hex 24)"
  owner_password="$(hex 24)"
  app_password="$(hex 24)"
  database="surefy"
  setup_token="$(hex 16)"

  proxy_lines=""
  if [ "$mode" = proxy ]; then
    proxy_lines="# Behind your proxy: ml reaches the public address as any client does, and Caddy keeps the
# X-Forwarded-* headers of proxies on private networks.
SUREFY_INTERNAL_ALIAS=caddy
SUREFY_TRUSTED_PROXIES=private_ranges"
  fi

  # The file holds every secret of the install: readable by its owner only.
  (
    umask 077
    cat >"$env_file" <<EOF
# Written by infra/scripts/install.sh. Keep it private and keep a copy: ENCRYPTION_KEY protects
# the provider keys stored in Vault, and losing it makes them unreadable.

# Address and ports. COMPOSE_PROFILES picks the proxy: tls (HTTPS) or http (plain HTTP).
SUREFY_DOMAIN=$domain
APP_ORIGIN=$app_origin
API_PUBLIC_URL=$app_origin
COMPOSE_PROFILES=$profile
SUREFY_SITE_ADDRESS=$site_address
SUREFY_PUBLIC_HOST=$public_host
SUREFY_HTTP_PORT=$http_port
SUREFY_HTTPS_PORT=$https_port
SUREFY_BIND_ADDRESS=$bind
$proxy_lines
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

  case "$mode" in
    tls)
      if [ "$http_port" != 80 ] || [ "$https_port" != 443 ]; then
        echo "Note: a certificate from a public authority is issued over ports 80 and 443 of $domain." >&2
        echo "      With other ports, forward 80 and 443 to them, or the certificate request fails." >&2
      fi
      ;;
    http)
      echo "Note: plain HTTP sends passwords and sessions unencrypted. Use it on a private network only." >&2
      ;;
    proxy)
      echo "Point your proxy at http://${bind}:${http_port} and forward the original Host header." >&2
      ;;
  esac
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
