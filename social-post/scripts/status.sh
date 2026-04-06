#!/bin/bash
# status.sh — Show which social platforms are configured.
set -euo pipefail

CRED_DIR="$HOME/.linggen/skills/social-post/credentials"

check_platform() {
    local name="$1"
    local file="$2"
    shift 2
    local vars=("$@")

    if [ ! -f "$CRED_DIR/$file" ]; then
        printf "  %-12s  NOT CONFIGURED\n" "$name"
        return
    fi

    source "$CRED_DIR/$file"
    local ok=true
    for var in "${vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            ok=false
            break
        fi
    done

    if $ok; then
        printf "  %-12s  READY\n" "$name"
    else
        printf "  %-12s  INCOMPLETE (missing keys)\n" "$name"
    fi
}

echo "Social Post — Platform Status"
echo "=============================="
echo ""
check_platform "X (Twitter)" "x.env" X_API_KEY X_API_SECRET X_ACCESS_TOKEN X_ACCESS_TOKEN_SECRET
check_platform "Facebook" "facebook.env" FB_PAGE_ID FB_PAGE_ACCESS_TOKEN
check_platform "LinkedIn" "linkedin.env" LI_ACCESS_TOKEN LI_USER_URN
echo ""
echo "To configure a platform: /social-post config <platform>"
echo "Credentials stored in: $CRED_DIR/"
