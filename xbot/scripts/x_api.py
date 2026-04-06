#!/usr/bin/env python3
"""X API helper — shared OAuth1 session for all xbot scripts."""
import json
import os
import sys

def load_credentials():
    cred_dir = os.path.expanduser("~/.linggen/skills/xbot/credentials")
    env_file = os.path.join(cred_dir, "x.env")
    if not os.path.exists(env_file):
        print("ERROR: X not configured. Run: /xbot config", file=sys.stderr)
        sys.exit(1)
    creds = {}
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                key, val = line.split("=", 1)
                creds[key.strip()] = val.strip().strip('"').strip("'")
    required = ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]
    for r in required:
        if r not in creds or not creds[r]:
            print(f"ERROR: Missing {r} in x.env", file=sys.stderr)
            sys.exit(1)
    return creds

def get_session():
    from requests_oauthlib import OAuth1Session
    creds = load_credentials()
    return OAuth1Session(
        creds["X_API_KEY"],
        client_secret=creds["X_API_SECRET"],
        resource_owner_key=creds["X_ACCESS_TOKEN"],
        resource_owner_secret=creds["X_ACCESS_TOKEN_SECRET"],
    )

def api_get(endpoint, params=None):
    session = get_session()
    resp = session.get(f"https://api.x.com/2{endpoint}", params=params)
    return resp.status_code, resp.json()

def api_post(endpoint, payload):
    session = get_session()
    resp = session.post(f"https://api.x.com/2{endpoint}", json=payload)
    return resp.status_code, resp.json()
