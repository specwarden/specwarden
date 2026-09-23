# Roll back a deploy

**Symptom:** error rate up within minutes of a deploy.

1. Find the previous image tag in the deploy log.
2. Run `scripts/deploy.sh <previous-tag>` — the same script, an older tag. A rollback is a
   deploy, so it is tested every time a deploy is.
3. Confirm the proxy routes to the new containers: `deploy/nginx/upstreams.conf` names
   them by service, never by address, so nothing there changes.
