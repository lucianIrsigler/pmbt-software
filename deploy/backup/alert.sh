#!/bin/sh
# Emails ALERT_EMAIL over SMTP with curl, using the app's SMTP settings (SMTP_HOST,
# SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM). Never includes client data.
#   alert.sh "Subject" "Body text"
#   alert.sh test                      (sends a test alert)
# ALERT_DRY_RUN=1 prints the email instead of sending it.
# Used by backup.sh here, and by deploy/monitor/check.sh on the second machine.
set -eu

subject="${1:-}"
body="${2:-}"
if [ "$subject" = "test" ]; then
  subject="Test alert from $(hostname)"
  body="If you can read this, alerts reach you. Nothing is wrong."
fi
if [ -z "$subject" ]; then
  echo 'usage: alert.sh "Subject" "Body"   (or: alert.sh test)' >&2
  exit 2
fi

log() { echo "alert: $*" >&2; }

if [ -z "${ALERT_EMAIL:-}" ]; then
  log "ALERT_EMAIL is not set; not sent: $subject"
  exit 0
fi

# MAIL_FROM may be "Name <address>"; the SMTP envelope needs the bare address.
from_header="${MAIL_FROM:-${SMTP_USER:-alerts@localhost}}"
from_address=$(printf '%s' "$from_header" | sed -n 's/.*<\([^>]*\)>.*/\1/p')
[ -n "$from_address" ] || from_address="$from_header"

# Plain LF line endings: curl --crlf turns them into the CRLF that SMTP needs.
message=$(printf 'From: %s\nTo: %s\nSubject: [dogstuff] %s\nDate: %s\nContent-Type: text/plain; charset=utf-8\n\n%s\n' \
  "$from_header" "$ALERT_EMAIL" "$subject" "$(date -R)" "$body")

if [ "${ALERT_DRY_RUN:-}" = "1" ]; then
  log "dry run, would send:"
  printf '%s\n' "$message"
  exit 0
fi

host="${SMTP_HOST:?SMTP_HOST is not set}"
port="${SMTP_PORT:-465}"
# Port 465 uses TLS from the start; others (587) upgrade with STARTTLS (--ssl-reqd).
if [ "$port" = "465" ]; then scheme=smtps; else scheme=smtp; fi

# The login goes through a curl config file, not the command line (visible in `ps`).
# Quoted, with backslashes and double quotes escaped: Gmail app passwords have spaces.
config=$(mktemp)
trap 'rm -f "$config"' EXIT
if [ -n "${SMTP_USER:-}" ]; then
  login=$(printf '%s:%s' "$SMTP_USER" "${SMTP_PASS:-}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
  printf 'user = "%s"\n' "$login" > "$config"
fi

if printf '%s\n' "$message" | curl --silent --show-error --ssl-reqd --crlf --max-time 30 \
  --config "$config" --url "$scheme://$host:$port" \
  --mail-from "$from_address" --mail-rcpt "$ALERT_EMAIL" --upload-file -; then
  log "sent: $subject"
else
  log "FAILED to send: $subject"
  exit 1
fi
