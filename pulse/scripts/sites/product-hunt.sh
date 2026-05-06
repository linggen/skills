#!/usr/bin/env bash
# product-hunt.sh — registered as the FetchProductHuntRSS tool.
#
# Fetches today's launches from Product Hunt's public Atom feed.
# (PH calls it "feed" — it's actually Atom 1.0, not RSS 2.0.)
# Free, no auth, no API key. Useful for spotting competing launches.
#
# Output: JSON array of {title, url, summary, author, date, source}.

set -uo pipefail

URL="https://www.producthunt.com/feed"

xml="$(curl -fsS --max-time 15 -A "linggen-pulse/0.1" "$URL" 2>/dev/null)" || {
  echo "[]"
  exit 0
}

python3 - "$xml" <<'PY' 2>/dev/null || echo "[]"
import sys, json, re, xml.etree.ElementTree as ET
ns = {"a": "http://www.w3.org/2005/Atom"}
try:
    root = ET.fromstring(sys.argv[1])
except Exception:
    print("[]")
    sys.exit(0)

def strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", s).strip()

out = []
for entry in root.findall("a:entry", ns):
    title = (entry.findtext("a:title", default="", namespaces=ns) or "").strip()
    pub   = (entry.findtext("a:published", default="", namespaces=ns) or "").strip()
    content = entry.findtext("a:content", default="", namespaces=ns) or ""
    summary = strip_html(content)[:300]
    link_el = entry.find("a:link[@rel='alternate']", ns) or entry.find("a:link", ns)
    url = link_el.get("href").strip() if link_el is not None else ""
    author = ""
    auth_el = entry.find("a:author/a:name", ns)
    if auth_el is not None and auth_el.text:
        author = auth_el.text.strip()
    out.append({
        "title": title,
        "url": url,
        "summary": summary,
        "author": author,
        "date": pub,
        "source": "product-hunt",
    })
print(json.dumps(out[:25]))
PY
