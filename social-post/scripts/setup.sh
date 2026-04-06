#!/bin/bash
# setup.sh — Interactive credential setup for social-post skill.
# Usage: bash setup.sh <platform>
# Where platform is: x | facebook | linkedin
set -euo pipefail

CRED_DIR="$HOME/.linggen/skills/social-post/credentials"
mkdir -p "$CRED_DIR"
chmod 700 "$CRED_DIR"

PLATFORM="${1:-}"

case "$PLATFORM" in
    x|twitter)
        echo "=== X (Twitter) Setup ==="
        echo ""
        echo "You need 4 values from your X Developer App:"
        echo "  1. API Key (Consumer Key)"
        echo "  2. API Secret (Consumer Secret)"
        echo "  3. Access Token"
        echo "  4. Access Token Secret"
        echo ""
        echo "Get these at: https://developer.x.com/en/portal/dashboard"
        echo "See the full guide: cat ~/.linggen/skills/social-post/references/SETUP-GUIDE.md"
        echo ""
        read -p "API Key: " api_key
        read -p "API Secret: " api_secret
        read -p "Access Token: " access_token
        read -p "Access Token Secret: " access_token_secret
        cat > "$CRED_DIR/x.env" <<EOF
X_API_KEY="$api_key"
X_API_SECRET="$api_secret"
X_ACCESS_TOKEN="$access_token"
X_ACCESS_TOKEN_SECRET="$access_token_secret"
EOF
        chmod 600 "$CRED_DIR/x.env"
        echo ""
        echo "OK: X credentials saved to $CRED_DIR/x.env"
        ;;

    facebook|fb)
        echo "=== Facebook Page Setup ==="
        echo ""
        echo "You need 2 values:"
        echo "  1. Page ID"
        echo "  2. Page Access Token (never-expiring)"
        echo ""
        echo "Get these at: https://developers.facebook.com/tools/explorer/"
        echo "See the full guide: cat ~/.linggen/skills/social-post/references/SETUP-GUIDE.md"
        echo ""
        read -p "Page ID: " page_id
        read -p "Page Access Token: " page_token
        cat > "$CRED_DIR/facebook.env" <<EOF
FB_PAGE_ID="$page_id"
FB_PAGE_ACCESS_TOKEN="$page_token"
EOF
        chmod 600 "$CRED_DIR/facebook.env"
        echo ""
        echo "OK: Facebook credentials saved to $CRED_DIR/facebook.env"
        ;;

    linkedin|li)
        echo "=== LinkedIn Setup ==="
        echo ""
        echo "You need 2 values:"
        echo "  1. Access Token (expires every 60 days)"
        echo "  2. User URN ID (your LinkedIn member ID)"
        echo ""
        echo "Get these at: https://www.linkedin.com/developers/apps"
        echo "See the full guide: cat ~/.linggen/skills/social-post/references/SETUP-GUIDE.md"
        echo ""
        read -p "Access Token: " access_token
        read -p "User URN ID (just the number, e.g. abc123XY): " user_urn
        cat > "$CRED_DIR/linkedin.env" <<EOF
LI_ACCESS_TOKEN="$access_token"
LI_USER_URN="$user_urn"
EOF
        chmod 600 "$CRED_DIR/linkedin.env"
        echo ""
        echo "OK: LinkedIn credentials saved to $CRED_DIR/linkedin.env"
        echo "NOTE: Token expires in 60 days. Re-run this setup to refresh."
        ;;

    *)
        echo "Usage: bash setup.sh <platform>"
        echo ""
        echo "Platforms:"
        echo "  x          X (Twitter) — OAuth 1.0a keys"
        echo "  facebook   Facebook Page — Page Access Token"
        echo "  linkedin   LinkedIn — OAuth 2.0 Bearer Token"
        echo ""
        echo "Example: bash setup.sh x"
        exit 1
        ;;
esac
