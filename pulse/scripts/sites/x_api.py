#!/usr/bin/env python3
"""X (Twitter) API helper for Pulse — App-only Bearer over stdlib urllib.

Pulse only READS from X (search, own posts, mentions), all of which work with
App-only (OAuth 2.0 Bearer) auth. We mint the bearer from the Consumer
Key/Secret at request time, so the only credentials Pulse needs are:
  X_API_KEY="..."      # Consumer Key
  X_API_SECRET="..."   # Consumer Secret
(X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET may still be present from an OAuth 1.0a
setup — they're ignored here.)

Why stdlib + Bearer instead of OAuth 1.0a: OAuth 1.0a signing needs the
third-party `requests_oauthlib`, which the engine's python3 frequently lacks
(homebrew/system interpreters) — so the X tools imported-failed and silently
returned empty, looking like "no X signal". `urllib` + `json` are in EVERY
python3, so this works no matter which interpreter the engine resolves.

load_credentials() returns None (never raises) when key/secret are absent, so
callers degrade gracefully to empty JSON + a clear error.
"""
import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request

CRED_FILE = os.path.expanduser("~/.linggen/skills/pulse/credentials/x.env")
REQUIRED = ["X_API_KEY", "X_API_SECRET"]

_bearer_cache = None
_self_followers = None  # follower count captured by the last resolve_self_id()


def load_credentials():
    if not os.path.exists(CRED_FILE):
        return None
    creds = {}
    try:
        with open(CRED_FILE) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    creds[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        return None
    if not all(creds.get(r) for r in REQUIRED):
        return None
    return creds


def _http(req):
    """Return (status, parsed_json|{}). HTTP errors return their code + body;
    transport errors return (None, {error})."""
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {}
    except Exception as e:
        return None, {"error": str(e)}


def get_bearer(creds):
    """Mint (and cache) an App-only Bearer token from the consumer key/secret."""
    global _bearer_cache
    if _bearer_cache:
        return _bearer_cache
    key = urllib.parse.quote(creds["X_API_KEY"], safe="")
    secret = urllib.parse.quote(creds["X_API_SECRET"], safe="")
    basic = base64.b64encode(f"{key}:{secret}".encode()).decode()
    req = urllib.request.Request(
        "https://api.x.com/oauth2/token",
        data=b"grant_type=client_credentials",
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        method="POST",
    )
    _, body = _http(req)
    tok = body.get("access_token") if isinstance(body, dict) else None
    if tok:
        _bearer_cache = tok
    return tok


def api_get(endpoint, params=None):
    """GET https://api.x.com/2<endpoint>. Returns (status, json).
    status is None (with an explanatory error) when creds or the bearer are
    missing — distinct from a real HTTP status like 401/403/429."""
    creds = load_credentials()
    if not creds:
        return None, {"error": "no X credentials — set X_API_KEY and X_API_SECRET in Settings -> X"}
    bearer = get_bearer(creds)
    if not bearer:
        return None, {"error": "could not mint X bearer token — check the Consumer Key/Secret (X_API_KEY/X_API_SECRET) and that the app has API access"}
    url = f"https://api.x.com/2{endpoint}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {bearer}"})
    return _http(req)


def resolve_self_id():
    """App-only Bearer has no `/users/me`, so resolve the account id from the
    handle configured in config.json (sites.x.username) via /users/by/username.
    Returns (id, username, error) — error is None on success."""
    cfg = os.path.expanduser("~/.linggen/skills/pulse/config.json")
    username = ""
    try:
        with open(cfg) as f:
            x = ((json.load(f) or {}).get("sites") or {}).get("x") or {}
            username = (x.get("username") or "").strip().lstrip("@")
    except Exception:
        pass
    if not username:
        return None, "", "no X handle configured — set your X handle in Settings -> X"
    # Ask for public_metrics on the same lookup so the follower count rides
    # along at zero extra API cost (callers that don't need it just ignore it).
    status, body = api_get(
        "/users/by/username/" + urllib.parse.quote(username),
        {"user.fields": "public_metrics"},
    )
    if status is None:
        return None, username, (body or {}).get("error", "X credentials error")
    if status != 200:
        return None, username, f"X user lookup failed ({status}) for @{username}"
    data = (body or {}).get("data") or {}
    uid = data.get("id")
    if not uid:
        return None, username, f"could not resolve X user id for @{username}"
    global _self_followers
    _self_followers = (data.get("public_metrics") or {}).get("followers_count")
    return uid, username, None


def self_followers():
    """Follower count from the most recent successful resolve_self_id() call.
    None until resolve_self_id() has run and returned public_metrics."""
    return _self_followers
