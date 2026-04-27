#!/usr/bin/env bash
set -euo pipefail

: "${MONGODB_URI:?MONGODB_URI is required}"
: "${DB_NAME:?DB_NAME is required}"

wait_for_url() {
  local url="$1"
  local name="$2"
  echo "Waiting for ${name} at ${url} ..."
  until curl -fsS "$url" >/dev/null; do
    sleep 3
  done
  echo "${name} is ready."
}

wait_for_url "http://app-v1-traditional:3000/api/health" "V1"
wait_for_url "http://app-v2-atlas-search:3000/api/health" "V2"
wait_for_url "http://app-v3-hybrid-search:3000/api/health" "V3"
wait_for_url "http://app-v4-rag:3000/api/health" "V4"

echo "Seeding demo data with embeddings into ${DB_NAME} ..."
curl -fsS -X POST "http://app-v2-atlas-search:3000/api/seed?embeddings=true"

echo
echo "Creating Atlas Search and Vector Search indexes in ${DB_NAME} ..."
if ! DB_NAME="$DB_NAME" mongosh "$MONGODB_URI" /workspace/shared/scripts/create-travel-lab-indexes.js; then
  echo "Atlas Search index creation skipped or failed. This is expected on local MongoDB without Atlas Search."
fi

echo
echo "Startup initialization completed."
