#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="https://github.com/agingfixed/schematicsApp.git"
DEFAULT_DIR="$HOME/SchematicsStudio"
INSTALL_DIR="${SCHEMATICS_APP_DIR:-$DEFAULT_DIR}"
BRANCH="${SCHEMATICS_APP_BRANCH:-main}"
PORT="${SCHEMATICS_APP_PORT:-5173}"

log() {
  printf '\033[1;34m==>\033[0m %s\n' "$*"
}

warn() {
  printf '\033[1;33mWARN:\033[0m %s\n' "$*" >&2
}

error() {
  printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

missing=0
for cmd in git npm; do
  if ! command_exists "$cmd"; then
    warn "$cmd is not installed."
    missing=$((missing + 1))
  fi
done

if [ "$missing" -ne 0 ]; then
  error "Please install the missing dependencies and rerun this script."
  exit 1
fi

if [ ! -d "$INSTALL_DIR" ]; then
  log "Creating installation directory at $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  log "Cloning Schematics Studio repository"
  git clone "$REPO_URL" "$INSTALL_DIR"
else
  if [ ! -d "$INSTALL_DIR/.git" ]; then
    error "The target directory $INSTALL_DIR exists but is not a git repository."
    exit 1
  fi
  log "Updating existing installation in $INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch origin
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --rebase origin "$BRANCH"
fi

cd "$INSTALL_DIR"

log "Installing npm dependencies"
npm install

log "Starting development server on http://localhost:${PORT}"
npm run dev -- --host 0.0.0.0 --port "$PORT" &
DEV_PID=$!

cleanup() {
  if ps -p "$DEV_PID" >/dev/null 2>&1; then
    kill "$DEV_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

URL="http://localhost:${PORT}/"

if command_exists curl; then
  for attempt in $(seq 1 30); do
    if curl --silent --head "$URL" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
else
  sleep 5
fi

if command_exists xdg-open; then
  if xdg-open "$URL" >/dev/null 2>&1; then
    log "Launched your default browser at $URL"
  else
    warn "Unable to launch a browser automatically. Please open $URL manually."
  fi
elif command_exists open; then
  if open "$URL" >/dev/null 2>&1; then
    log "Launched your default browser at $URL"
  else
    warn "Unable to launch a browser automatically. Please open $URL manually."
  fi
elif command_exists start; then
  if start "" "$URL" >/dev/null 2>&1; then
    log "Launched your default browser at $URL"
  else
    warn "Unable to launch a browser automatically. Please open $URL manually."
  fi
else
  warn "Unable to launch a browser automatically. Please open $URL manually."
fi

log "Schematics Studio is running. Press Ctrl+C to stop."
wait "$DEV_PID"
