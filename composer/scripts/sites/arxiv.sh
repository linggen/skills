#!/usr/bin/env bash
# arxiv.sh — registered as the FetchArxiv tool.
#
# Fetches the 30 most recently submitted papers from arxiv's CS.AI /
# CS.LG / CS.CL categories via the public Atom API. Output: JSON array
# of {title, summary, url, authors, published}.
# The agent filters by today's themes after this runs.

set -uo pipefail

URL="http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=30"

xml=$(curl -fsS --max-time 15 -A "linggen-composer/0.1" "$URL" 2>/dev/null) || {
  echo "[]"
  exit 0
}

python3 - "$xml" <<'PY' 2>/dev/null || echo "[]"
import sys, json, xml.etree.ElementTree as ET
ns = {"a": "http://www.w3.org/2005/Atom"}
try:
    root = ET.fromstring(sys.argv[1])
except Exception:
    print("[]")
    sys.exit(0)
out = []
for entry in root.findall("a:entry", ns):
    title = (entry.findtext("a:title", default="", namespaces=ns) or "").strip()
    summary = (entry.findtext("a:summary", default="", namespaces=ns) or "").strip()
    url = (entry.findtext("a:id", default="", namespaces=ns) or "").strip()
    published = (entry.findtext("a:published", default="", namespaces=ns) or "").strip()
    authors = [
        (a.findtext("a:name", default="", namespaces=ns) or "").strip()
        for a in entry.findall("a:author", ns)
    ]
    out.append({
        "title": " ".join(title.split()),
        "summary": " ".join(summary.split())[:500],
        "url": url,
        "authors": authors,
        "published": published,
    })
print(json.dumps(out))
PY
