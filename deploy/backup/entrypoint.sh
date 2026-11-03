#!/bin/sh
# Runs backup.sh on BACKUP_SCHEDULE (cron syntax, in $TZ) with BusyBox crond, in the
# foreground so `docker compose logs backup` shows each run.
set -eu

schedule="${BACKUP_SCHEDULE:-0 2 * * *}"
mkdir -p /etc/crontabs
# Pass the database settings through to the cron job's environment.
{
  echo "PGHOST=${PGHOST}"
  echo "PGUSER=${PGUSER}"
  echo "PGPASSWORD=${PGPASSWORD}"
  echo "PGDATABASE=${PGDATABASE}"
  echo "BACKUP_REMOTE=${BACKUP_REMOTE:-}"
  echo "TZ=${TZ:-UTC}"
  echo "${schedule} /usr/local/bin/backup.sh > /proc/1/fd/1 2> /proc/1/fd/2"
} > /etc/crontabs/root
chmod 600 /etc/crontabs/root

echo "backup: scheduled '${schedule}' (${TZ:-UTC}); off-server copy: ${BACKUP_REMOTE:-off}"
exec crond -f -l 8
