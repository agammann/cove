#!/bin/sh
set -eu

# These fixed paths are the mounts in both supported Compose files. Other
# projects, volumes and overrides are not discoverable here; operators must
# identify their installation before using the fresh-install override.
mode=${1:?Expected start or initialize}
shift
legacy=/cove/legacy
target=/var/lib/postgresql
cluster=/var/lib/postgresql/18/docker
marker="$cluster/.cove-init-complete"
lock="$target/.cove-init-attempt"

fail() { echo "Cove PostgreSQL 18: $*" >&2; exit 1; }
[ "${PGDATA:-}" = "$cluster" ] || fail 'unexpected PGDATA; use a reviewed custom procedure'
[ -d "$legacy" ] && [ -d "$target" ] || fail 'required storage mount is missing'
legacy_entries=$(ls -A "$legacy") || fail 'could not inspect legacy storage'
[ -z "$legacy_entries" ] || fail 'legacy storage is populated; do not initialize or start this target'

case "$mode" in
  initialize)
    [ "${COVE_PG18_FRESH_INSTALL:-}" = 'confirmed-no-existing-cove-database' ] || fail 'fresh-install confirmation required'
    target_entries=$(ls -A "$target") || fail 'could not inspect PostgreSQL 18 storage'
    [ -z "$target_entries" ] || fail 'target storage is not empty; inspect it before any recovery'
    # mkdir is atomic: only one initializer can claim this fresh volume. The
    # attempt record remains even after failure, so an interrupted init cannot
    # be retried as if the target were fresh.
    mkdir "$lock" || fail 'another initialization has already claimed this target'
    target_entries=$(ls -A "$target") || fail 'could not recheck PostgreSQL 18 storage'
    [ "$target_entries" = '.cove-init-attempt' ] || fail 'target changed during initialization'
    ;;
  start)
    [ -d "$lock" ] && [ ! -L "$lock" ] || fail 'initialization attempt record is missing or invalid'
    [ -d "$target/18" ] && [ ! -L "$target/18" ] && [ -d "$cluster" ] && [ ! -L "$cluster" ] || fail 'PG18 cluster is missing or invalid'
    [ -f "$cluster/PG_VERSION" ] && [ ! -L "$cluster/PG_VERSION" ] || fail 'PG18 cluster is missing; follow the fresh-install or recovery instructions'
    [ "$(cat "$cluster/PG_VERSION")" = '18' ] || fail 'target is not a PostgreSQL 18 cluster'
    [ -f "$marker" ] && [ ! -L "$marker" ] || fail 'initialization marker is missing; inspect the incomplete target'
    control=$(pg_controldata "$cluster") || fail 'could not read cluster identity'
    identity=$(printf '%s\n' "$control" | sed -n 's/^Database system identifier:[[:space:]]*//p')
    case "$identity" in ''|*[!0-9]*) fail 'cluster identity is invalid' ;; esac
    [ "$(cat "$marker")" = "cove-postgres18-initialization-complete-v1:$identity" ] || fail 'initialization marker does not match this cluster'
    ;;
  *) fail 'unknown startup mode' ;;
esac
exec /usr/local/bin/docker-entrypoint.sh "$@"
