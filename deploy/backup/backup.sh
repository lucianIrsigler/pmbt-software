#!/bin/sh
# One backup: a compressed pg_dump of the database into /backups/daily, a copy into
# /backups/weekly on Sundays, rotation (14 daily, 8 weekly), then an optional copy off
# the server over SSH. Safe to run by hand: docker compose exec backup backup.sh
# If any step fails, ALERT_EMAIL gets an email saying which (see alert.sh).
set -eu

BACKUPS=/backups
KEEP_DAILY=14
KEEP_WEEKLY=8

log() { echo "backup: $(date '+%Y-%m-%d %H:%M:%S %Z') $*"; }

step="starting"
on_exit() {
  status=$?
  rm -f /tmp/backup_ssh_key
  [ "$status" -eq 0 ] && return
  log "FAILED while $step (exit $status)"
  /usr/local/bin/alert.sh "Backup FAILED on $(hostname)" "The nightly backup failed while $step (exit $status), at $(date '+%Y-%m-%d %H:%M %Z').

See what happened:  docker compose -f docker-compose.prod.yml logs backup
Try again by hand:  docker compose -f docker-compose.prod.yml exec backup backup.sh" || true
}
trap on_exit EXIT

mkdir -p "$BACKUPS/daily" "$BACKUPS/weekly"
name="dogstuff-$(date +%Y-%m-%dT%H%M).dump"
target="$BACKUPS/daily/$name"

step="dumping the database"
# Write to a temporary file first, so a failed dump never looks like a good backup.
log "dumping to daily/$name"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --file "$target.partial"
mv "$target.partial" "$target"
log "done ($(du -h "$target" | cut -f1))"

# Sunday (day 7): also keep it as a weekly backup.
step="keeping the weekly copy"
if [ "$(date +%u)" = "7" ]; then
  cp "$target" "$BACKUPS/weekly/$name"
  log "kept as weekly/$name"
fi

# Rotation: keep the newest N of each (names sort by date).
prune() {
  dir="$1"
  keep="$2"
  ls -1 "$dir"/*.dump 2>/dev/null | sort -r | tail -n +"$((keep + 1))" | while read -r old; do
    rm -f -- "$old"
    log "removed $(basename "$old")"
  done
}
step="removing old backups"
prune "$BACKUPS/daily" "$KEEP_DAILY"
prune "$BACKUPS/weekly" "$KEEP_WEEKLY"

# Off-server copy. No --delete: the other machine keeps everything it has received, so
# a problem on this server can never wipe the copies there.
step="copying off the server"
if [ -n "${BACKUP_REMOTE:-}" ]; then
  key=/run/secrets/backup_ssh_key
  known=/run/secrets/known_hosts
  if [ ! -f "$key" ] || [ ! -f "$known" ]; then
    log "ERROR: BACKUP_REMOTE is set but secrets/backup_ssh_key or secrets/known_hosts is missing"
    exit 1
  fi
  # ssh refuses keys readable by others; the mounted secret may not be 600.
  cp "$key" /tmp/backup_ssh_key
  chmod 600 /tmp/backup_ssh_key
  rsync -a --exclude '*.partial' \
    -e "ssh -i /tmp/backup_ssh_key -o UserKnownHostsFile=$known -o StrictHostKeyChecking=yes -o BatchMode=yes" \
    "$BACKUPS/" "$BACKUP_REMOTE"
  log "copied to $BACKUP_REMOTE"
else
  log "off-server copy skipped (BACKUP_REMOTE not set)"
fi
