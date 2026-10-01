#!/bin/bash
# pingshu-r2.sh — the 评书 to Cloudflare R2, in one command (Hanli, 2026-10-01).
#
#   bash tools/pingshu-r2.sh [OUT]      # OUT defaults to ~/Downloads/评书样音/r2
#
# Idempotent; run it again whenever tools/pingshu-publish.py made more:
#   1. wrangler login (a browser tab, the first time only)
#   2. the bucket `linggen-media`, if it isn't there
#   3. the custom domain media.linggen.dev on it, if it isn't attached
#      (zone looked up by name with wrangler's own login; or set CF_ZONE_ID)
#   4. every file under OUT/jiuding-lu not uploaded yet → linggen-media/jiuding-lu/…
#      as audio/mp4, cached for a year, immutable (the names are content hashes).
#      What went up is listed in OUT/.uploaded, so a rerun sends only the new.
# The manifest (story/jiuding-lu/audio.json) stays in git; commit it after publishing.
set -euo pipefail
OUT=${1:-"$HOME/Downloads/评书样音/r2"}
BUCKET=linggen-media
DOMAIN=media.linggen.dev
ZONE_NAME=linggen.dev
JOBS=${JOBS:-8}
W=(npx --yes wrangler@4)
cd "$OUT"

"${W[@]}" whoami 2>/dev/null | grep -q 'associated with the email' || "${W[@]}" login

if ! "${W[@]}" r2 bucket list 2>/dev/null | grep -qw -- "$BUCKET"; then
  "${W[@]}" r2 bucket create "$BUCKET"
fi

zone_id() {
  [ -n "${CF_ZONE_ID:-}" ] && { echo "$CF_ZONE_ID"; return; }
  local cfg token
  for cfg in "$HOME/Library/Preferences/.wrangler/config/default.toml" "$HOME/.config/.wrangler/config/default.toml" "$HOME/.wrangler/config/default.toml"; do
    [ -f "$cfg" ] && token=$(sed -n 's/^oauth_token = "\(.*\)"$/\1/p' "$cfg") && [ -n "$token" ] && break
  done
  curl -fsS -H "Authorization: Bearer $token" "https://api.cloudflare.com/client/v4/zones?name=$ZONE_NAME" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"][0]["id"])'
}
if ! "${W[@]}" r2 bucket domain list "$BUCKET" 2>/dev/null | grep -q "$DOMAIN"; then
  "${W[@]}" r2 bucket domain add "$BUCKET" --domain "$DOMAIN" --zone-id "$(zone_id)" --min-tls 1.2 --force
fi

touch .uploaded
find jiuding-lu -type f -name '*.m4a' | sort | comm -23 - <(sort .uploaded) > .pending || true
n=$(wc -l < .pending | tr -d ' ')
echo "uploading $n new files to $BUCKET (of $(find jiuding-lu -type f -name '*.m4a' | wc -l | tr -d ' '))"
put() {
  "${W[@]}" r2 object put "$BUCKET/$1" --file "$1" --remote \
    --content-type audio/mp4 --cache-control 'public, max-age=31536000, immutable' >/dev/null && echo "$1"
}
export -f put; export BUCKET; W_STR="${W[*]}"; export W_STR
# Each finished upload is appended to the ledger as it lands, so a stopped run resumes.
xargs -P "$JOBS" -I{} bash -c 'W=($W_STR); put "$1"' _ {} < .pending >> .uploaded
rm -f .pending
echo "done. check: curl -sI https://$DOMAIN/$(tail -1 .uploaded)"
