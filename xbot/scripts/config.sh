#!/bin/bash
# config.sh — Load xbot credentials for a given platform.
# Usage: source config.sh <platform>
# Sets platform-specific env vars or exits with error.

CRED_DIR="$HOME/.linggen/skills/xbot/credentials"

load_x() {
    local f="$CRED_DIR/x.env"
    if [ ! -f "$f" ]; then
        echo "ERROR: X/Twitter not configured. Run: /xbot config x" >&2
        return 1
    fi
    source "$f"
    if [ -z "$X_API_KEY" ] || [ -z "$X_API_SECRET" ] || [ -z "$X_ACCESS_TOKEN" ] || [ -z "$X_ACCESS_TOKEN_SECRET" ]; then
        echo "ERROR: X/Twitter credentials incomplete. Run: /xbot config x" >&2
        return 1
    fi
}

load_facebook() {
    local f="$CRED_DIR/facebook.env"
    if [ ! -f "$f" ]; then
        echo "ERROR: Facebook not configured. Run: /xbot config facebook" >&2
        return 1
    fi
    source "$f"
    if [ -z "$FB_PAGE_ID" ] || [ -z "$FB_PAGE_ACCESS_TOKEN" ]; then
        echo "ERROR: Facebook credentials incomplete. Run: /xbot config facebook" >&2
        return 1
    fi
}

load_linkedin() {
    local f="$CRED_DIR/linkedin.env"
    if [ ! -f "$f" ]; then
        echo "ERROR: LinkedIn not configured. Run: /xbot config linkedin" >&2
        return 1
    fi
    source "$f"
    if [ -z "$LI_ACCESS_TOKEN" ] || [ -z "$LI_USER_URN" ]; then
        echo "ERROR: LinkedIn credentials incomplete. Run: /xbot config linkedin" >&2
        return 1
    fi
}
