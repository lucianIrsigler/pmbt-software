#!/usr/bin/env bash
#
# Deploys the current commit from this computer, without GitHub Actions or a registry:
#
#   1. checks the code (typecheck, lint, unit tests)
#   2. builds the web, tools and backup images, tagged with the commit (sha-<12 chars>)
#   3. uploads them to the server over SSH (docker save | ssh … docker load)
#   4. copies docker-compose.prod.yml and the Caddyfile
#   5. starts the new version (migrations run first; a failed migration stops the deploy)
#   6. checks https://<domain>/api/health
#
# Run it from the project folder in Git Bash (Windows) or any bash shell:
#
#   deploy/deploy.sh                 normal deploy
#   deploy/deploy.sh --skip-checks   skip step 1
#   deploy/deploy.sh --allow-dirty   deploy uncommitted changes (tagged …-dirty-<time>)
#
# Settings: deploy/.env.deploy (not committed; copy deploy/.env.deploy.example), or the
# same names as environment variables. IMAGE_PREFIX and APP_URL come from the server's .env.
# Needs Docker running here, and SSH access to the server as the deploy user.
# More: docs/DEPLOY.md and docs/RUNBOOK.md ("Deploying").

set -euo pipefail

cd "$(dirname "$0")/.."

skip_checks=false
allow_dirty=false
for arg in "$@"; do
  case "$arg" in
    --skip-checks) skip_checks=true ;;
    --allow-dirty) allow_dirty=true ;;
    -h | --help)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (see --help)" >&2
      exit 2
      ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }
fail() {
  printf '\nDeploy stopped: %s\n' "$*" >&2
  exit 1
}

# --- Settings ---------------------------------------------------------------------------

# Environment variables win over the file (e.g. DEPLOY_HOST=… deploy/deploy.sh). Only these
# three names are read; Windows line endings are fine.
if [ -f deploy/.env.deploy ]; then
  while IFS='=' read -r key value; do
    value=${value%$'\r'}
    case "$key" in
      DEPLOY_HOST | DEPLOY_PATH | DEPLOY_PLATFORM)
        [ -n "${!key:-}" ] || printf -v "$key" '%s' "$value"
        ;;
    esac
  done < deploy/.env.deploy
fi
: "${DEPLOY_HOST:?Set DEPLOY_HOST in deploy/.env.deploy (e.g. deploy@203.0.113.10)}"
DEPLOY_PATH=${DEPLOY_PATH:-/opt/daisyhealing}
# The server's CPU type. Most VPSs are linux/amd64; ARM servers need linux/arm64.
DEPLOY_PLATFORM=${DEPLOY_PLATFORM:-linux/amd64}

remote() { ssh "$DEPLOY_HOST" "$@"; }

# --- What to deploy ---------------------------------------------------------------------

# Only tracked files count: untracked notes don't go into the images (see .dockerignore).
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  $allow_dirty || fail "there are uncommitted changes. Commit them, or use --allow-dirty."
  TAG="sha-$(git rev-parse --short=12 HEAD)-dirty-$(date +%Y%m%d%H%M)"
else
  TAG="sha-$(git rev-parse --short=12 HEAD)"
fi
echo "Deploying $TAG to $DEPLOY_HOST:$DEPLOY_PATH ($DEPLOY_PLATFORM)"

# --- 1. Checks --------------------------------------------------------------------------

if $skip_checks; then
  step "Skipping checks (--skip-checks)"
else
  step "Checking the code"
  pnpm typecheck
  pnpm lint
  pnpm test
fi

# --- Server settings --------------------------------------------------------------------

step "Reading the server's settings"
docker info >/dev/null 2>&1 || fail "Docker isn't running on this computer. Start Docker Desktop."
# The error from ssh/cat (shown above this message) says which: no access, or no such file.
server_env=$(remote "cat '$DEPLOY_PATH/.env'") ||
  fail "can't read $DEPLOY_PATH/.env on $DEPLOY_HOST (see the error above). Check SSH access, that DEPLOY_PATH is the app folder on the server (ls it there), and that .env exists (docs/DEPLOY.md step 3)."

env_value() {
  # The value of $1 in the server's .env, without surrounding quotes.
  printf '%s\n' "$server_env" | sed -n "s/^$1=//p" | tail -n 1 | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}
IMAGE_PREFIX=$(env_value IMAGE_PREFIX)
APP_URL=$(env_value APP_URL)
[ -n "$IMAGE_PREFIX" ] || fail "IMAGE_PREFIX is empty in the server's .env (e.g. IMAGE_PREFIX=daisyhealing)."
[ -n "$APP_URL" ] || fail "APP_URL is empty in the server's .env."
APP_URL=${APP_URL%/}

# --- 2. Build ---------------------------------------------------------------------------

images=("$IMAGE_PREFIX/web:$TAG" "$IMAGE_PREFIX/tools:$TAG" "$IMAGE_PREFIX/backup:$TAG")

step "Building the images (the first build takes a few minutes)"
docker build --platform "$DEPLOY_PLATFORM" --target web -t "${images[0]}" .
docker build --platform "$DEPLOY_PLATFORM" --target tools -t "${images[1]}" .
docker build --platform "$DEPLOY_PLATFORM" -t "${images[2]}" deploy/backup

# --- 3. Upload --------------------------------------------------------------------------

step "Uploading the images to the server (a few hundred MB: this can take a while)"
# dd shows how much has been sent so far and the speed.
docker save "${images[@]}" | gzip -1 | dd bs=1M status=progress | remote "gunzip | docker load"

# --- 4. Compose file and Caddyfile ------------------------------------------------------

step "Copying docker-compose.prod.yml and Caddyfile"
scp -q deploy/docker-compose.prod.yml deploy/Caddyfile "$DEPLOY_HOST:$DEPLOY_PATH/"

# --- 5. Start the new version -----------------------------------------------------------

step "Starting $TAG (migrations first)"
# $DEPLOY_PATH and $TAG expand here, on this computer.
# shellcheck disable=SC2029
remote "
  set -eu
  cd '$DEPLOY_PATH'
  # Record the deployed version, so manual commands and rollbacks use it.
  if grep -q '^IMAGE_TAG=' .env; then
    sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/' .env
  else
    echo 'IMAGE_TAG=$TAG' >> .env
  fi
  # Our images were just loaded, so only missing standard ones (Postgres, Caddy) are pulled.
  docker compose -f docker-compose.prod.yml up -d --remove-orphans --wait
  # Apply a changed Caddyfile (up -d doesn't restart Caddy for a file change alone).
  docker compose -f docker-compose.prod.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile
  docker image prune -f >/dev/null
"

# --- 6. Check ---------------------------------------------------------------------------

step "Checking $APP_URL/api/health"
for _ in $(seq 1 30); do
  if curl -fsS "$APP_URL/api/health"; then
    # Free space on this computer: older deploy images aren't needed here (the server keeps
    # its own copies for rollbacks, and the build cache keeps the next build fast).
    docker images --format '{{.Repository}}:{{.Tag}}' |
      grep -E "^$IMAGE_PREFIX/(web|tools|backup):sha-" | grep -vF ":$TAG" |
      xargs -r docker image rm >/dev/null 2>&1 || true
    printf '\n\nDeployed %s.\n' "$TAG"
    exit 0
  fi
  sleep 5
done
fail "the site did not report healthy after deploying $TAG. On the server: dc ps; dc logs web migrate caddy"
