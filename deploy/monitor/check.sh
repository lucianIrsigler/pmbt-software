#!/bin/sh
# Watches the site from the second (backup) machine, where it can notice what the server
# can't report itself: the server being down, or backups no longer arriving.
#
#   check.sh /path/to/monitor.env        (from cron every 5 minutes; see docs/RUNBOOK.md)
#
# Checks:
#   1. SITE_URL/api/health answers (app and database up). Alerts after 2 failures in a row.
#   2. The newest backup under BACKUP_DIR is younger than MAX_BACKUP_AGE_HOURS (26).
# Emails once when a check starts failing and once when it recovers (state in STATE_DIR),
# using alert.sh from the same folder. Needs only POSIX sh, curl and find.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
if [ -n "${1:-}" ]; then
  # shellcheck disable=SC1090
  . "$1"
fi

: "${SITE_URL:?Set SITE_URL, e.g. https://bookings.example.com}"
STATE_DIR="${STATE_DIR:-$HOME/.dogstuff-monitor}"
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-26}"
HEALTH_FAILURES_BEFORE_ALERT="${HEALTH_FAILURES_BEFORE_ALERT:-2}"
ALERT="${ALERT_SCRIPT:-$here/alert.sh}"
export ALERT_EMAIL SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS MAIL_FROM ALERT_DRY_RUN 2>/dev/null || true

mkdir -p "$STATE_DIR"
now() { date '+%Y-%m-%d %H:%M %Z'; }
log() { echo "monitor: $(now) $*"; }

# record <name> <ok|fail> <failures needed> <subject when down> <body when down>
# Counts failures in a row; sends one alert when the count reaches the limit, and one
# "recovered" email when a check that was down passes again.
record() {
  name="$1" result="$2" needed="$3" subject="$4" body="$5"
  count_file="$STATE_DIR/$name.failures"
  down_file="$STATE_DIR/$name.down"
  if [ "$result" = ok ]; then
    if [ -f "$down_file" ]; then
      since=$(cat "$down_file")
      sh "$ALERT" "Recovered: $subject" "This is working again (it was failing since $since)." || true
      log "$name recovered"
    fi
    rm -f "$count_file" "$down_file"
    return 0
  fi
  count=$(( $(cat "$count_file" 2>/dev/null || echo 0) + 1 ))
  echo "$count" > "$count_file"
  log "$name failed ($count in a row)"
  if [ "$count" -ge "$needed" ] && [ ! -f "$down_file" ]; then
    now > "$down_file"
    sh "$ALERT" "$subject" "$body" || true
  fi
  return 1
}

status=0

# 1. The site and its database.
health_url="${SITE_URL%/}/api/health"
if curl --silent --fail --max-time 20 --output /dev/null "$health_url"; then
  record health ok "$HEALTH_FAILURES_BEFORE_ALERT" "Site down: $SITE_URL" "" || true
else
  record health fail "$HEALTH_FAILURES_BEFORE_ALERT" "Site down: $SITE_URL" \
    "$health_url has not answered for the last $HEALTH_FAILURES_BEFORE_ALERT checks (checked from $(hostname), $(now)).

Clients can't book and the owner's app won't load. On the server:
  docker compose -f docker-compose.prod.yml ps
  docker compose -f docker-compose.prod.yml logs --tail=100 web
See docs/RUNBOOK.md, Troubleshooting." || status=1
fi

# 2. Backups still arriving here.
if [ -n "${BACKUP_DIR:-}" ]; then
  minutes=$((MAX_BACKUP_AGE_HOURS * 60))
  fresh=$(find "$BACKUP_DIR" -name '*.dump' -type f -mmin "-$minutes" 2>/dev/null | head -n 1)
  if [ -n "$fresh" ]; then
    record backups ok 1 "No new backup for $SITE_URL" "" || true
  else
    record backups fail 1 "No new backup for $SITE_URL" \
      "No backup newer than $MAX_BACKUP_AGE_HOURS hours has arrived in $BACKUP_DIR on $(hostname) ($(now)).

Either the nightly backup failed on the server (there may be a separate alert), or the
copy to this machine did. On the server:
  docker compose -f docker-compose.prod.yml logs --tail=100 backup
See docs/RUNBOOK.md, Backups." || status=1
  fi
fi

exit "$status"
