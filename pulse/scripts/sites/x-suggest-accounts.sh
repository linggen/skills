#!/usr/bin/env bash
# x-suggest-accounts.sh — candidate finder for the X target-accounts list.
#
# An on-demand SETUP helper (triggered by the "Suggest accounts" button in
# Settings, NOT part of the daily pipeline). Pure script, no agent: gathers
# candidate accounts from two sources and ranks them heuristically — the
# USER picks the good ones, so no LLM judgment is needed.
#
# Sources:
#   A. Following — GET /users/<me>/following. Kept only if the bio matches
#      the niche vocabulary (your keywords + AI/dev terms), so mega-generic
#      follows (NASA, Tesla) are dropped.
#   B. Keyword harvest — recent-search each of sites.x.keywords and collect
#      the AUTHORS of the hits (these are on-topic by construction); track
#      how many searches each recurs in.
#
# Ranking favors mid-tier niche accounts with engagement; mega-accounts
# (> ~600k followers) are flagged + de-ranked, NOT removed (the user may
# still pick one deliberately). Already-listed handles + self are dropped.
#
# Output (JSON array, exit 0; [] on no creds):
#   [{ handle, name, followers, bio, source, seen_count, mega, score, why }]
#   sorted by score desc.
#
# Cost: 1 following call + up to 3 keyword searches (your X credits).
# Deps: python3 stdlib only.

set -uo pipefail

if ! command -v python3 &>/dev/null; then
  printf '%s\n' '[]'; exit 0
fi

SITES_DIR="$(cd "$(dirname "$0")" && pwd)"
SITES_DIR="$SITES_DIR" CONFIG="$HOME/.linggen/skills/pulse/config.json" python3 <<'PY'
import json, os, re, sys
sys.path.insert(0, os.environ["SITES_DIR"])
from x_api import api_get, resolve_self_id  # noqa: E402

MEGA = 600_000           # above this = de-ranked, flagged (saturated replies)
TINY = 1_000             # below this = no audience to reach
SWEET_LO, SWEET_HI = 2_000, 300_000

try:
    with open(os.environ["CONFIG"]) as f:
        x = (json.load(f).get("sites", {}).get("x", {}) or {})
except Exception:
    x = {}

keywords = [k.strip() for k in (x.get("keywords") or []) if k and k.strip()][:3]
already = {h.strip().lstrip("@").lower() for h in (x.get("target_accounts") or []) if h.strip()}

# Niche vocabulary used to keep/score: the user's keywords + a default AI/dev
# term set. A following account must hit one of these to survive (else it's
# off-niche, like NASA). Harvest authors are on-topic already.
NICHE = set(w.lower() for w in keywords)
NICHE |= {"agent", "agents", "agentic", "llm", "llms", "ai", "ml", "model",
          "inference", "rag", "memory", "context", "mcp", "claude", "gpt",
          "coding", "code", "dev", "developer", "engineer", "engineering",
          "tooling", "tools", "builder", "founder", "open source", "opensource",
          "local", "eval", "evals", "observability", "prompt"}

def bio_hits(bio):
    b = (bio or "").lower()
    return sum(1 for w in NICHE if w in b)

# Negative filter: drop accounts whose bio screams off-niche promo (SEO,
# crypto, dropship, etc.). These match the keyword search because they stuff
# "AI" into posts to farm attention, but their audience is marketers/traders,
# not devs — replying to them does nothing. Single tokens use word boundaries
# so "seo"/"nft" don't false-match inside other words.
SPAM_TOKENS = ["seo", "crypto", "web3", "nft", "memecoin", "airdrop",
               "presale", "forex", "dropship", "dropshipping", "onlyfans",
               "casino", "betting", "trader", "trading", "ico", "defi"]
SPAM_PHRASES = ["make money", "making money", "get rich", "financial freedom",
                "trading signals", "pump and dump", "passive income",
                "grow your following", "buy followers"]

def is_spam(bio):
    b = (bio or "").lower()
    if any(p in b for p in SPAM_PHRASES):
        return True
    return any(re.search(r"\b" + t + r"\b", b) for t in SPAM_TOKENS)

my_id, my_handle, err = resolve_self_id()
my_handle_l = (my_handle or "").lower()

# handle -> candidate dict
cand = {}
def add(u, source):
    h = (u.get("username") or "")
    hl = h.lower()
    if not hl or hl == my_handle_l or hl in already:
        return None
    if is_spam(u.get("description")):   # drop SEO/crypto/dropship promo bios
        return None
    pm = u.get("public_metrics") or {}
    c = cand.get(hl)
    if not c:
        c = {
            "handle": h, "name": u.get("name", h),
            "followers": pm.get("followers_count", 0),
            "bio": (u.get("description") or "")[:140],
            "source": source, "seen_count": 0,
        }
        cand[hl] = c
    elif source == "following":
        c["source"] = "following+search"
    return c

# ── Source A: following ──────────────────────────────────────────────
if my_id:
    status, data = api_get(f"/users/{my_id}/following", {
        "max_results": 100,
        "user.fields": "username,name,public_metrics,description",
    })
    if status == 200:
        for u in data.get("data", []) or []:
            if bio_hits(u.get("description")) > 0:   # niche bio required for follows
                add(u, "following")

# ── Source B: keyword harvest ────────────────────────────────────────
for kw in keywords:
    status, data = api_get("/tweets/search/recent", {
        "query": f"{kw} -is:retweet -is:reply lang:en",
        "max_results": 50,
        "sort_order": "relevancy",
        "tweet.fields": "public_metrics,author_id",
        "user.fields": "username,name,public_metrics,description",
        "expansions": "author_id",
    })
    if status != 200:
        continue
    users = {u["id"]: u for u in (data.get("includes", {}) or {}).get("users", [])}
    for t in data.get("data", []) or []:
        u = users.get(t.get("author_id"))
        if not u:
            continue
        c = add(u, "search")
        if c:
            c["seen_count"] += 1

# ── Rank ─────────────────────────────────────────────────────────────
def score(c):
    f = c["followers"]
    s = 0.0
    if SWEET_LO <= f <= SWEET_HI:      s += 50          # the sweet spot
    elif SWEET_HI < f <= MEGA:         s += 30          # big but reply-viable
    elif TINY <= f < SWEET_LO:         s += 15          # small, may still help
    else:                               s += 0           # tiny / unknown
    if f > MEGA:                        s -= 40          # mega: saturated, de-rank
    s += min(c["seen_count"], 3) * 12                    # recurrence across searches
    s += min(bio_hits(c["bio"]), 4) * 5                  # niche-bio strength
    if c["source"].startswith("following"):  s += 8      # you already vetted them
    return s

out = []
for c in cand.values():
    c["mega"] = c["followers"] > MEGA
    c["score"] = round(score(c), 1)
    band = ("mid-tier niche" if SWEET_LO <= c["followers"] <= SWEET_HI
            else "mega — saturated, low odds" if c["mega"]
            else "small audience" if c["followers"] < SWEET_LO
            else "large but reply-viable")
    src = ("in your following" if c["source"] == "following"
           else "following + on-topic posts" if c["source"] == "following+search"
           else f"posts on your topics (×{c['seen_count']})")
    c["why"] = f"{band}; {src}"
    out.append(c)

out.sort(key=lambda c: -c["score"])
print(json.dumps(out[:40]))
PY
