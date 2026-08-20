#!/usr/bin/env python3
"""X (Twitter) reader for Pulse — via the linggen-browser bridge ($0, no paid API).

Pulse reads X (keyword search, curated targets, own posts, mentions) by
brokering the read through the local daemon to the linggen-browser extension,
which reads the user's LOGGED-IN x.com session. There is no metered X API path
anymore: when the bridge or extension isn't there, the read returns None and
the caller degrades to an empty (but valid) result.

  bridge_call(op, params) -> list   the read result ([] is authoritative)
                          -> None    bridge/extension absent, not ready, or errored

cache_get / cache_put memoize results to disk so a repeat gather within a TTL
reuses the last pull. See doc/browser-bridge-spec.md.
"""
import hashlib
import json
import os
import sys
import time
import urllib.request


# ── Response cache ────────────────────────────────────────────────────────
# Pulse gathers run often and X content barely moves minute-to-minute, so
# callers cache results to disk and reuse within a TTL. Cache ONLY successful,
# non-empty results so a transient bridge miss doesn't pin an empty list for the
# whole window.
_CACHE_DIR = os.path.expanduser("~/.linggen/skills/pulse/state/x-cache")


def _cache_path(key):
    return os.path.join(_CACHE_DIR, hashlib.sha1(key.encode()).hexdigest()[:16] + ".json")


def cache_get(key, ttl_seconds):
    """Return the cached value if present and younger than ttl_seconds, else None."""
    if not ttl_seconds or ttl_seconds <= 0:
        return None
    p = _cache_path(key)
    try:
        if time.time() - os.path.getmtime(p) <= ttl_seconds:
            with open(p) as f:
                return json.load(f)
    except Exception:
        return None
    return None


def cache_put(key, value):
    try:
        os.makedirs(_CACHE_DIR, exist_ok=True)
        with open(_cache_path(key), "w") as f:
            json.dump(value, f)
    except Exception:
        pass


# ── Browser bridge ─────────────────────────────────────────────────────────
# The linggen-browser extension reads the user's logged-in x.com session for $0.
# Skills don't speak its WebSocket — they POST one read to the local daemon,
# which brokers it to the extension. See doc/browser-bridge-spec.md.
BRIDGE_URL = "http://127.0.0.1:9527/api/bridge/call"


# Set by bridge_call when the bridge answered with an error code (or was
# unreachable). Lets a reader script tell an ACTIONABLE failure apart from an
# authoritative empty when it decides what to print.
LAST_BRIDGE_CODE = None

# Failures the USER can fix — the gather agent turns these into an
# instruction card instead of a quiet "no results" empty state.
_ACTIONABLE_CODES = {"x_logged_out", "no_bridge"}


def degrade_json(source="x"):
    """What a reader script prints when bridge_call returned None. A status
    object for failures the user can fix (logged out in the connected browser /
    no extension connected); the plain empty array for everything else, so
    downstream ranking keeps its list contract."""
    if LAST_BRIDGE_CODE in _ACTIONABLE_CODES:
        return json.dumps({"source": source, "items": [], "status": LAST_BRIDGE_CODE})
    return "[]"


# An x read is mostly WAITING, and the default has to cover all of it: the
# bridge paces 3-10s before it dispatches, the x module another 4-9s before the
# tab opens, then the capture itself runs to 20s and the tab dwells 1-4s — about
# 45s worst case before a healthy op answers. The old 20s default could not fit
# that, so ops timed out on pacing alone and returned None, which every caller
# renders as an authoritative empty. A DISCONNECTED bridge still fails fast
# (the daemon answers `no_bridge` without waiting), so the longer budget costs
# nothing in the common failure. `targets` overrides upward — it batches.
def bridge_call(op, params, timeout_ms=60000):
    """Broker one X read through the browser bridge. Returns the result list on
    success (possibly empty — an authoritative empty), or None when the bridge
    or extension is absent / not ready / errored (the reader op may not exist
    yet). Never raises: a missing daemon/extension just returns None and stamps
    LAST_BRIDGE_CODE so degrade_json() can say why."""
    global LAST_BRIDGE_CODE
    LAST_BRIDGE_CODE = None
    body = json.dumps(
        {"module": "x", "op": op, "params": params or {}, "timeout_ms": timeout_ms}
    ).encode()
    req = urllib.request.Request(
        BRIDGE_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_ms / 1000 + 5) as r:
            out = json.loads(r.read().decode("utf-8"))
    except Exception:
        LAST_BRIDGE_CODE = "no_bridge"  # daemon down / route absent
        return None
    if not isinstance(out, dict) or not out.get("ok"):
        # Bridge present but degraded (no extension, not logged in, op missing).
        # Log the code to the daemon log so it's debuggable, then degrade.
        code = out.get("code") if isinstance(out, dict) else None
        LAST_BRIDGE_CODE = code or "upstream_error"
        if code:
            sys.stderr.write(f"[x_bridge] {op}: degrade ({code})\n")
        return None
    data = out.get("data")
    # Most ops return a list; `own` returns a dict {items, replied_to}. Pass
    # both through; coerce anything else to an empty list.
    return data if isinstance(data, (list, dict)) else []
