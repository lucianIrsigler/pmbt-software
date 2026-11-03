# Nightly database backups: pg_dump on a cron schedule, rotation, optional off-server copy.
# Same Postgres major version as the database, so pg_dump/pg_restore always match.
FROM postgres:16.11-alpine

# curl sends failure alerts over SMTP (alert.sh).
RUN apk add --no-cache rsync openssh-client tzdata curl

COPY backup.sh restore.sh entrypoint.sh alert.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/entrypoint.sh \
  /usr/local/bin/alert.sh

VOLUME ["/backups"]
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
