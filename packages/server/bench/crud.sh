#!/usr/bin/env bash
# One full CRUD cycle against the app on port $1: create → read → update → delete.
set -euo pipefail
P="$1"
base="http://127.0.0.1:${P}/items"

id=$(curl -s -X POST "$base" -H 'content-type: application/json' -d '{"name":"a"}' \
  | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

curl -s "$base/$id" >/dev/null
curl -s -X PUT "$base/$id" -H 'content-type: application/json' -d '{"name":"b"}' >/dev/null
curl -s -X DELETE "$base/$id" >/dev/null
