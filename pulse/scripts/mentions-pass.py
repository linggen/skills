#!/usr/bin/env python3
"""mentions-pass.py — backs CheckMentions, the scheduled mentions pass.

Reads the inbox lanes that need no browser (HN, Bluesky, Reddit — each only
when its site is on and its username is set), keeps what it has already seen
in state/mentions-seen.json, and answers with what is NEW since the last pass.
X is left out on purpose: its reads open an x.com tab, and nobody is at the
screen for a scheduled run.

New replies to the user go to Yinyue as facts (POST /api/yinyue/event on the
local engine) — she decides whether and how to say them. The first pass only
records a baseline: two weeks of old replies are not news.

Output (one JSON line): {baseline?, new_replies, new_mentions, by_source,
items: [{kind, source, author, title, url}], checked: [...], errors: [...],
told_yinyue}

PULSE_FAKE_MENTIONS='{"hn": {...}, ...}' replaces the fetchers (tests);
PULSE_NO_TELL=1 keeps Yinyue out of it.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.environ.get("PULSE_DIR") or os.path.dirname(HERE)
CONFIG = os.path.join(SKILL_DIR, "config.json")
SEEN = os.path.join(SKILL_DIR, "state", "mentions-seen.json")
KEEP = 2000
INBOX = {"reply_to_me", "mention"}

# lane → (site key, the field that must be set, fetcher script, args)
LANES = {
    "hn": ("hackernews", "username", "hn-mentions.sh", ["72"]),
    "bluesky": ("bluesky", "handle", "bluesky-mentions.sh", []),
    "reddit": ("reddit", "username", "reddit-mentions.sh", []),
}


def read_json(path, fallback):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return fallback


def lanes_on(cfg):
    sites = cfg.get("sites") or {}
    out = []
    for lane, (key, field, _, _) in LANES.items():
        site = sites.get(key) or {}
        if site.get("enabled") and str(site.get(field) or "").strip():
            out.append(lane)
    return out


def fetch(lane):
    fake = os.environ.get("PULSE_FAKE_MENTIONS")
    if fake:
        return json.loads(fake).get(lane) or {"items": []}
    _, _, script, args = LANES[lane]
    r = subprocess.run(["bash", os.path.join(HERE, "sites", script), *args],
                       capture_output=True, text=True, timeout=120)
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    return json.loads(lines[-1]) if lines else {"items": [], "errors": [r.stderr.strip()[:200] or "no output"]}


def key_of(item):
    return str(item.get("url") or f"{item.get('author')}|{item.get('created_iso')}|{item.get('title')}")


def new_items(found, seen):
    """found: {lane: [items]} → the inbox items not in `seen`, oldest lane order kept."""
    out = []
    for lane, items in found.items():
        for it in items:
            if it.get("kind") in INBOX and key_of(it) not in seen:
                out.append({"kind": it["kind"], "source": lane, "author": it.get("author") or "",
                            "title": (it.get("title") or "")[:120], "url": it.get("url") or ""})
    return out


def facts_for_yinyue(fresh):
    """A plain fact line, per the moments contract — she words it."""
    replies = [i for i in fresh if i["kind"] == "reply_to_me"]
    by = {}
    for i in replies:
        by.setdefault(i["source"], []).append(i)
    names = {"hn": "Hacker News", "bluesky": "Bluesky", "reddit": "Reddit"}
    parts = []
    for lane, items in by.items():
        who = ", ".join(f"{i['author']} on \"{i['title']}\"" if i["title"] else i["author"] for i in items[:3])
        more = f" and {len(items) - 3} more" if len(items) > 3 else ""
        parts.append(f"{names.get(lane, lane)}: {len(items)} ({who}{more})")
    return "Pulse found new replies to the user since its last check — " + "; ".join(parts) + "."


def tell_yinyue(text):
    if os.environ.get("PULSE_NO_TELL") == "1":
        return False
    try:
        body = json.dumps({"app": "pulse", "text": text}).encode()
        req = urllib.request.Request(
            "http://127.0.0.1:%s/api/yinyue/event" % os.environ.get("LINGGEN_PORT", "9527"),
            data=body, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=5).read()
        return True
    except Exception:
        return False


def main():
    cfg = read_json(CONFIG, {})
    lanes = lanes_on(cfg)
    state = read_json(SEEN, {})
    seen_list = state.get("seen") or []
    seen = set(seen_list)
    baseline = not state.get("checked_at")
    found, errors = {}, []
    for lane in lanes:
        try:
            r = fetch(lane)
        except Exception as e:
            r = {"items": [], "errors": [str(e)[:200]]}
        found[lane] = [i for i in (r.get("items") or []) if isinstance(i, dict)]
        errors += [f"{lane}: {e}" for e in (r.get("errors") or [])]
    fresh = [] if baseline else new_items(found, seen)
    for items in found.values():
        for it in items:
            k = key_of(it)
            if it.get("kind") in INBOX and k not in seen:
                seen.add(k)
                seen_list.append(k)
    os.makedirs(os.path.dirname(SEEN), exist_ok=True)
    with open(SEEN, "w", encoding="utf-8") as f:
        json.dump({"checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "seen": seen_list[-KEEP:]}, f, ensure_ascii=False)
    replies = [i for i in fresh if i["kind"] == "reply_to_me"]
    told = tell_yinyue(facts_for_yinyue(fresh)) if replies else False
    by_source = {}
    for i in fresh:
        by_source[i["source"]] = by_source.get(i["source"], 0) + 1
    out = {"new_replies": len(replies), "new_mentions": len(fresh) - len(replies),
           "by_source": by_source, "items": fresh[:10], "checked": lanes,
           "errors": errors, "told_yinyue": told}
    if baseline:
        out["baseline"] = True
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())
