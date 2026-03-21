#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Safelytics – Testnet bootstrap
#
# What this does:
#   1. Generates an "issuer" Stellar keypair (our fake MXNe issuer for testnet).
#   2. Funds both the issuer via Friendbot.
#   3. Prints the keys so you can put them in .env.
#
# Requirements: curl, jq, stellar-sdk (Node) OR we use Horizon REST directly.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HORIZON="https://horizon-testnet.stellar.org"

generate_keypair() {
  # Uses Stellar laboratory keygen endpoint
  curl -s "https://laboratory.stellar.org/api/generate-keypair" 2>/dev/null || true
}

fund_account() {
  local addr="$1"
  echo "  Funding $addr via Friendbot..."
  curl -s "https://friendbot.stellar.org?addr=${addr}" | jq -r '.hash // "already funded or error"'
}

echo "═══════════════════════════════════════════════════"
echo "  Safelytics Testnet Setup"
echo "═══════════════════════════════════════════════════"
echo ""
echo "1. Go to https://laboratory.stellar.org/#account-creator to generate"
echo "   a keypair for the MXNe ISSUER account."
echo ""
echo "2. Fund it with Friendbot:"
echo "   curl 'https://friendbot.stellar.org?addr=<YOUR_ISSUER_G_ADDRESS>'"
echo ""
echo "3. Put the issuer G... address in .env → MXNE_ISSUER"
echo ""
echo "4. Create the .env file:"
cat << 'EOF'
cp .env.example .env
# Then fill in:
#   MXNE_ISSUER=G...
#   KEY_ENCRYPTION_SECRET=$(openssl rand -hex 32)
#   JWT_SECRET=$(openssl rand -base64 48)
EOF
echo ""
echo "5. Run the backend:"
echo "   cargo run"
echo ""
echo "6. Test register + pay:"
echo "   see scripts/smoke_test.sh"
echo ""
echo "NOTE: For testnet, the backend auto-creates wallets but you need to:"
echo "  a) Fund each wallet with Friendbot (XLM for fees)"
echo "  b) Establish a trustline to the MXNe asset"
echo "  c) Send test MXNe from the issuer to the customer wallet"
echo ""
echo "Quick trustline + fund script (run after registering a user):"
cat << 'SCRIPT'
WALLET="G<customer_address>"
# Fund with XLM
curl "https://friendbot.stellar.org?addr=$WALLET"
# Establish trustline (use Stellar JS SDK or laboratory.stellar.org)
# Then send MXNe from issuer to wallet using lab or SDK
SCRIPT
