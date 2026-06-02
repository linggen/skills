#!/usr/bin/env python3
"""X (Twitter) API helper for Pulse — shared OAuth1 session.

Pulse is independent of the xbot skill: it reads its OWN credentials at
~/.linggen/skills/pulse/credentials/x.env (set up via Settings -> X, which
also offers a one-click copy from xbot's x.env). Nothing here touches xbot
at runtime.

x.env format (same keys as xbot):
  X_API_KEY="..."
  X_API_SECRET="..."
  X_ACCESS_TOKEN="..."
  X_ACCESS_TOKEN_SECRET="..."

load_credentials() returns None (never raises/exits) when creds are absent
or incomplete, so callers can degrade gracefully to empty JSON + an error.
"""
import os

CRED_FILE = os.path.expanduser("~/.linggen/skills/pulse/credentials/x.env")
REQUIRED = ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]


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


def get_session():
    """Return an OAuth1Session, or None if creds/dep are missing."""
    creds = load_credentials()
    if not creds:
        return None
    try:
        from requests_oauthlib import OAuth1Session
    except ImportError:
        return None
    return OAuth1Session(
        creds["X_API_KEY"],
        client_secret=creds["X_API_SECRET"],
        resource_owner_key=creds["X_ACCESS_TOKEN"],
        resource_owner_secret=creds["X_ACCESS_TOKEN_SECRET"],
    )


def api_get(endpoint, params=None):
    """GET https://api.x.com/2<endpoint>. Returns (status, json).
    status is None when no usable session (missing creds or requests_oauthlib)."""
    session = get_session()
    if session is None:
        return None, {"error": "no usable X session (missing credentials or requests_oauthlib)"}
    resp = session.get(f"https://api.x.com/2{endpoint}", params=params, timeout=20)
    try:
        return resp.status_code, resp.json()
    except Exception:
        return resp.status_code, {}
