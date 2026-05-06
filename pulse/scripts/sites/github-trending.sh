#!/usr/bin/env bash
# github-trending.sh — registered as the FetchGitHubTrending tool.
#
# Scrapes today's trending repos from github.com/trending. Optional
# language filter from ~/.linggen/skills/pulse/config.json
# (sites["github-trending"].language) — e.g. "rust", "python", "go".
# Empty = all languages.
#
# GitHub does not expose a trending API; this scrapes the public HTML
# page. It's a best-effort source; the script returns an empty array
# if the page structure changes.
#
# Output: JSON array of {full_name, owner, repo, url, description,
# language, stars, forks, stars_today, source}.

set -uo pipefail

CONFIG="$HOME/.linggen/skills/pulse/config.json"
LANG_PATH=""
if [[ -f "$CONFIG" ]]; then
  LANG_CFG="$(jq -r '.sites["github-trending"].language // empty' "$CONFIG" 2>/dev/null)"
  [[ -n "$LANG_CFG" ]] && LANG_PATH="/${LANG_CFG}"
fi

URL="https://github.com/trending${LANG_PATH}?since=daily"

html="$(curl -fsS --max-time 15 -A "Mozilla/5.0 linggen-pulse/0.1" "$URL" 2>/dev/null)" || {
  echo "[]"
  exit 0
}

python3 - "$html" <<'PY' 2>/dev/null || echo "[]"
import sys, json, re, html as htmllib
src = sys.argv[1]

# Each repo lives in <article class="Box-row">…</article>.
# Extract via regex (no bs4 dependency; small enough).
articles = re.findall(r'<article class="Box-row"(.*?)</article>', src, re.DOTALL)

repos = []
for art in articles[:25]:
    # full_name like "owner/repo" lives in <h2 …><a href="/owner/repo">…</a></h2>
    fn_match = re.search(r'<h2[^>]*>\s*<a[^>]+href="/([^"/]+/[^"]+)"', art)
    if not fn_match:
        continue
    full_name = fn_match.group(1)
    owner, repo = full_name.split("/", 1) if "/" in full_name else (full_name, "")

    # Description in a <p> after the h2; may be missing.
    desc_match = re.search(r'<p[^>]*class="[^"]*col-9[^"]*"[^>]*>\s*(.*?)\s*</p>', art, re.DOTALL)
    description = ""
    if desc_match:
        description = re.sub(r"<[^>]+>", "", desc_match.group(1))
        description = htmllib.unescape(description).strip()
        description = re.sub(r"\s+", " ", description)

    # Language label inside <span itemprop="programmingLanguage">…</span>.
    lang_match = re.search(r'<span[^>]+itemprop="programmingLanguage"[^>]*>([^<]+)</span>', art)
    language = lang_match.group(1).strip() if lang_match else ""

    # Stars (total) + forks: link wraps an SVG and the count.
    # GitHub markup: <a href="/owner/repo/stargazers" ...><svg .../> 12,345 </a>
    stars_match = re.search(
        r'href="/' + re.escape(full_name) + r'/stargazers".*?([0-9,]+)\s*</a>',
        art, re.DOTALL
    )
    forks_match = re.search(
        r'href="/' + re.escape(full_name) + r'/forks".*?([0-9,]+)\s*</a>',
        art, re.DOTALL
    )
    stars = int(stars_match.group(1).replace(",", "")) if stars_match else None
    forks = int(forks_match.group(1).replace(",", "")) if forks_match else None

    # Stars today: <span class="d-inline-block float-sm-right">N stars today</span>.
    today_match = re.search(r'([0-9,]+)\s+stars?\s+today', art)
    stars_today = int(today_match.group(1).replace(",", "")) if today_match else None

    repos.append({
        "full_name": full_name,
        "owner": owner,
        "repo": repo,
        "url": f"https://github.com/{full_name}",
        "description": description,
        "language": language,
        "stars": stars,
        "forks": forks,
        "stars_today": stars_today,
        "source": "github-trending",
    })

print(json.dumps(repos))
PY
