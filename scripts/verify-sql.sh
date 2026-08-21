#!/usr/bin/env bash
#
# Apply every migration to a real PostgreSQL, then run the SQL tests against it.
#
# The migrations are the only place several of this site's rules actually live:
# the promotion substantiation gate is a WHERE clause, the enquiry status rules
# are RAISE statements, and §60 is a column list on a definer function. None of
# that can be checked by reading the files, which is what the TypeScript tests
# do — so this exists to check the other half.
#
# Usage:
#   ./scripts/verify-sql.sh                 # start a throwaway cluster
#   DATABASE_URL=postgres://… ./scripts/verify-sql.sh
#
# With no DATABASE_URL it initialises a cluster in a temporary directory, uses
# it, and removes it on exit. That needs the PostgreSQL server binaries; on
# Debian and Ubuntu they live in /usr/lib/postgresql/<version>/bin, which is not
# on PATH by default.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"
TESTS="$ROOT/supabase/tests"

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }

if [ -z "${DATABASE_URL:-}" ]; then
  # Debian and Ubuntu keep the server binaries off PATH. Resolve the directory
  # once and use absolute paths from here on: `su` resets PATH, so exporting it
  # would not survive the hop to the unprivileged user below.
  PGBIN=""
  command -v initdb >/dev/null && PGBIN="$(dirname "$(command -v initdb)")"
  for d in /usr/lib/postgresql/*/bin /usr/pgsql-*/bin; do
    [ -z "$PGBIN" ] && [ -x "$d/initdb" ] && PGBIN="$d"
  done
  [ -n "$PGBIN" ] || {
    red "No DATABASE_URL and no PostgreSQL server binaries found."
    echo "Install postgresql, or point DATABASE_URL at a scratch database."
    exit 1
  }

  TMP="$(mktemp -d)"
  # initdb refuses to run as root, so hand the cluster to an unprivileged user
  # when that is who we are. The socket directory has to be reachable by them
  # too, which is why both are chowned rather than just the data directory.
  RUNAS=""
  if [ "$(id -u)" = "0" ]; then
    RUNAS="$(id -un postgres 2>/dev/null || echo nobody)"
    chown -R "$RUNAS" "$TMP"
    chmod 755 "$TMP"
  fi
  run() { if [ -n "$RUNAS" ]; then su "$RUNAS" -c "$1"; else bash -c "$1"; fi; }

  # A fixed port collides with anything already listening — another run of this
  # script, or a cluster somebody left up. Ask the kernel for a free one.
  PORT="${PGPORT:-$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()' 2>/dev/null || echo 55432)}"
  mkdir -p "$TMP/sock"; [ -n "$RUNAS" ] && chown "$RUNAS" "$TMP/sock"

  cleanup() {
    run "$PGBIN/pg_ctl -D '$TMP/data' stop -m immediate" >/dev/null 2>&1 || true
    rm -rf "$TMP"
  }
  trap cleanup EXIT

  echo "Starting a throwaway PostgreSQL in $TMP"
  run "$PGBIN/initdb -U postgres -A trust -D '$TMP/data'" >/dev/null
  run "$PGBIN/pg_ctl -D '$TMP/data' -o '-p $PORT -k $TMP/sock' -l '$TMP/log' start" >/dev/null
  # pg_ctl returns once the postmaster answers, so no sleep is needed here.
  DATABASE_URL="postgresql://postgres@localhost:$PORT/postgres?host=$TMP/sock"
fi

psql() { command psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

echo
echo "── Bootstrap ───────────────────────────────────────────"
psql -f "$TESTS/bootstrap.sql"
green "  ok  Supabase-shaped roles, auth schema and helpers"

echo
echo "── Migrations ──────────────────────────────────────────"
for f in "$MIGRATIONS"/*.sql; do
  if out="$(psql -f "$f" 2>&1)"; then
    printf '  ok  %s\n' "$(basename "$f")"
  else
    red "  FAILED  $(basename "$f")"
    echo "$out" | grep -E '^(psql:|ERROR|DETAIL|HINT)' | head -5
    exit 1
  fi
done

echo
echo "── Tests ───────────────────────────────────────────────"
shopt -s nullglob
FAILED=0
for f in "$TESTS"/*.test.sql; do
  echo "$(basename "$f")"
  # Each assertion reports itself as a NOTICE, which psql prefixes with the file
  # and line. The exit status is what decides pass or fail — grep is only how
  # the run is made readable, so its own status is discarded deliberately.
  out="$(psql -f "$f" 2>&1)" && status=0 || status=$?
  echo "$out" | grep -E 'NOTICE:|ERROR:|FAILED' | sed -E 's/^psql:[^ ]+ //; s/^NOTICE:  //' || true
  if [ "$status" -ne 0 ]; then
    red "  $(basename "$f") failed"
    FAILED=1
  fi
done
[ "$FAILED" -eq 0 ] || exit 1

echo
green "SQL verified: migrations apply cleanly and every assertion holds."
