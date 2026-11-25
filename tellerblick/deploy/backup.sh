#!/bin/sh
# Runs inside the backup container: one consistent snapshot per day, 14 days kept.
apk add --no-cache sqlite >/dev/null
while true; do
  d=$(date +%F)
  sqlite3 /data/tellerblick.db ".backup /backups/db-$d.sqlite"
  tar czf "/backups/photos-$d.tgz" -C /data photos
  # prune: only files created by this script, older than 14 days
  find /backups -maxdepth 1 -type f \( -name 'db-*.sqlite' -o -name 'photos-*.tgz' \) -mtime +14 -exec rm -f {} \;
  sleep 86400
done
