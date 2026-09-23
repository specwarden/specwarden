# Restore a backup

Backups are taken by `scripts/backup.sh` into the bucket named in `.env.example`.

1. Stop the api service; a restore under live writes is two databases pretending to be one.
2. Restore the dump, start the api, and check a known record.
