#!/usr/bin/env bash
# Nightly: dump the database and ship it to the bucket in BACKUP_BUCKET.
set -Eeuo pipefail

backup() {
  local stamp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  docker compose exec -T api pg_dump "$DATABASE_URL" | gzip > "/tmp/harbor-$stamp.sql.gz"
  aws s3 cp "/tmp/harbor-$stamp.sql.gz" "$BACKUP_BUCKET/"
}

backup
