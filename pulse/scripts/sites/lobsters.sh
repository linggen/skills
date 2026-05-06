#!/usr/bin/env bash
# lobsters.sh — registered as the FetchLobsters tool.
#
# Fetches the lobste.rs newest feed via its public JSON endpoint.
# Output: JSON array of {title, url, comments_url, score, tags,
# submitter_user, created_at, description}.
# The agent filters by today's themes after this runs.

set -uo pipefail

curl -fsS --max-time 10 \
  -A "linggen-pulse/0.1" \
  "https://lobste.rs/newest.json" 2>/dev/null \
  | jq 'map({
      title,
      url,
      comments_url,
      score,
      tags,
      submitter_user: (if (.submitter_user | type) == "object"
                       then .submitter_user.username
                       else .submitter_user end),
      created_at,
      description: ((.description // "") | .[:500])
    })' 2>/dev/null || echo "[]"
