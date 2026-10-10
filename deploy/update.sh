#!/usr/bin/env bash
# Holt den neuesten Stand und baut den Server-Container neu.
# Buildnummer = Anzahl der Commits, Hash = Kurz-Hash des Commits (Anzeige in der Online-Lobby).
# ALLOWED_ORIGINS (und optional ROUND_MS, GRACE_MS, MAP_ID, WS_COMPRESSION) in deploy/.env oder in der Umgebung setzen.
set -euo pipefail

# Alles in einer Funktion: git pull darf dieses Skript ändern, während bash es noch liest.
main() {
  cd "$(dirname "$0")"
  git pull --ff-only
  GIT_SHA="$(git rev-parse --short=7 HEAD)"
  BUILD_NUMBER="$(git rev-list --count HEAD)"
  export GIT_SHA BUILD_NUMBER
  echo "Baue Server Build #${BUILD_NUMBER} · ${GIT_SHA}"
  docker compose up -d --build
}

main "$@"
