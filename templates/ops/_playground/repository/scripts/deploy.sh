#!/usr/bin/env bash
# Deploy one image tag of the api and the worker. A rollback is this, with an older tag.
set -Eeuo pipefail

deploy() {
  local tag="$1"
  API_TAG="$tag" docker compose pull api worker
  API_TAG="$tag" docker compose up -d api worker
}

main() {
  local tag="${1:?usage: deploy.sh <image-tag>}"
  deploy "$tag"
}

main "$@"
