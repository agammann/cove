#!/bin/sh
set -eu
touch "$PGDATA/.synthetic-slow-started"
# A premature marker proves the TCP check, not just the marker, gates readiness.
printf 'premature-test-marker\n' > "$PGDATA/.cove-init-complete"
sleep 12
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE TABLE synthetic_slow(value text); INSERT INTO synthetic_slow VALUES ('completed')"
touch "$PGDATA/.synthetic-slow-finished"
