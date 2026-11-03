#!/bin/sh
# Runs backup.sh on BACKUP_SCHEDULE (cron syntax, in $TZ) with BusyBox crond, in the
# foreground so `docker compose logs backup` shows each run.
set -eu

schedule="${BACKUP_SCHEDULE:-0 2 * * *}"

# The cron job doesn't inherit this environment, so save the settings it needs to a
# file it reads first. `export -p` quotes every value, so passwords with spaces, quotes
# or % (special in crontabs) survive.
env_file=/etc/backup.env
export -p | grep -E "^export (PATH|PG[A-Z]+|BACKUP_REMOTE|TZ|SMTP_[A-Z]+|MAIL_FROM|ALERT_EMAIL)=" > "$env_file"
chmod 600 "$env_file"

mkdir -p /etc/crontabs
echo "${schedule} . $env_file && /usr/local/bin/backup.sh > /proc/1/fd/1 2> /proc/1/fd/2" > /etc/crontabs/root
chmod 600 /etc/crontabs/root

echo "backup: scheduled '${schedule}' (${TZ:-UTC}); off-server copy: ${BACKUP_REMOTE:-off}; alerts to: ${ALERT_EMAIL:-nobody (ALERT_EMAIL not set)}"
exec crond -f -l 8
