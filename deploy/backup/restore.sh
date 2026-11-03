#!/bin/sh
# Restores a backup into a database and prints row counts to check it.
#
#   restore.sh <file.dump> [database]      default database: restore_check (a scratch copy)
#
# Restoring over the live database is refused unless RESTORE_INTO_LIVE=yes, and should
# only be done with the app stopped (see docs/RUNBOOK.md, "Restore a backup").
set -eu

file="${1:-}"
target="${2:-restore_check}"

if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "usage: restore.sh <file.dump> [database]   (file not found: '${file}')" >&2
  exit 2
fi
if [ "$target" = "${PGDATABASE}" ] && [ "${RESTORE_INTO_LIVE:-}" != "yes" ]; then
  echo "Refusing to restore over the live database '${PGDATABASE}'." >&2
  echo "Stop the app first, then run with RESTORE_INTO_LIVE=yes (see docs/RUNBOOK.md)." >&2
  exit 3
fi

echo "restore: $(basename "$file") -> database '${target}'"
# Connect to the maintenance database to drop/create the target.
dropdb --if-exists --force --maintenance-db=postgres "$target"
createdb --maintenance-db=postgres "$target"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$target" "$file"

echo "restore: done. Row counts in '${target}':"
psql --dbname="$target" --no-psqlrc --tuples-only --command "
  select 'clients:       ' || count(*) from client
  union all select 'pets:          ' || count(*) from pet
  union all select 'appointments:  ' || count(*) from appointment
  union all select 'services:      ' || count(*) from service
  union all select 'users:         ' || count(*) from \"user\"
  union all select 'migrations:    ' || count(*) from drizzle.__drizzle_migrations;"
