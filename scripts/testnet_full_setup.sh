#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# Safelytics – Full Testnet Setup
#
# Crea y financia el issuer de MXNe en Stellar testnet,
# luego genera wallets de prueba para cliente y comercio,
# establece trustlines y fondea con MXNe de prueba.
#
# Requiere: curl, jq
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

HORIZON="https://horizon-testnet.stellar.org"
ASSET_CODE="MXNe"

# ── Colors ────────────────────────────────────────────────────────────────────
BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
info() { echo -e "${BLUE}→${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }

# ── Deps check ────────────────────────────────────────────────────────────────
for cmd in curl jq; do
  command -v "$cmd" &>/dev/null || { echo "Error: $cmd not found"; exit 1; }
done

echo ""
echo -e "${BOLD}══ Safelytics Testnet Setup ══${NC}"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1 – Register a merchant and a customer via the backend API
# (assumes backend is running on localhost:8080)
# ══════════════════════════════════════════════════════════════════════════════
BACKEND="http://localhost:8080"

echo -e "${BOLD}1. Checking backend…${NC}"
if ! curl -sf "$BACKEND/api/qr/health" &>/dev/null; then
  info "Backend not running yet, start it with:"
  echo "   cd backend && cargo run"
  echo ""
fi

echo -e "${BOLD}2. Registering test merchant…${NC}"
MERCHANT=$(curl -sf -X POST "$BACKEND/api/auth/merchant/register" \
  -H "Content-Type: application/json" \
  -d '{"business_name":"Taquería Demo","phone":"+52550000001","password":"demo1234"}' 2>/dev/null \
  || echo '{}')

MERCHANT_TOKEN=$(echo "$MERCHANT" | jq -r '.token // empty')
MERCHANT_PUBKEY=$(echo "$MERCHANT" | jq -r '.public_key // empty')

if [[ -z "$MERCHANT_TOKEN" ]]; then
  # Try login (already exists)
  MERCHANT=$(curl -sf -X POST "$BACKEND/api/auth/merchant/login" \
    -H "Content-Type: application/json" \
    -d '{"phone":"+52550000001","password":"demo1234"}' 2>/dev/null || echo '{}')
  MERCHANT_TOKEN=$(echo "$MERCHANT" | jq -r '.token // empty')
  MERCHANT_PUBKEY=$(echo "$MERCHANT" | jq -r '.public_key // empty')
fi
[[ -n "$MERCHANT_TOKEN" ]] && ok "Merchant token obtained" || warn "Could not register merchant (start backend first)"

echo ""
echo -e "${BOLD}3. Registering test customer…${NC}"
CUSTOMER=$(curl -sf -X POST "$BACKEND/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Juan Prueba","phone":"+52550000002","password":"demo1234"}' 2>/dev/null \
  || echo '{}')

CUSTOMER_TOKEN=$(echo "$CUSTOMER" | jq -r '.token // empty')
CUSTOMER_PUBKEY=$(echo "$CUSTOMER" | jq -r '.public_key // empty')

if [[ -z "$CUSTOMER_TOKEN" ]]; then
  CUSTOMER=$(curl -sf -X POST "$BACKEND/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"phone":"+52550000002","password":"demo1234"}' 2>/dev/null || echo '{}')
  CUSTOMER_TOKEN=$(echo "$CUSTOMER" | jq -r '.token // empty')
  CUSTOMER_PUBKEY=$(echo "$CUSTOMER" | jq -r '.public_key // empty')
fi
[[ -n "$CUSTOMER_TOKEN" ]] && ok "Customer token obtained" || warn "Could not register customer (start backend first)"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2 – MXNe issuer setup (manual – requires Stellar lab or JS SDK)
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}══ Manual Stellar Testnet Setup ══${NC}"
echo ""
echo "The following steps require the Stellar Laboratory or a Stellar SDK."
echo "We'll guide you through each one."
echo ""

echo -e "${BOLD}━━ A. Create MXNe Issuer Account ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  1. Go to: https://laboratory.stellar.org/#account-creator?network=test"
echo "  2. Click 'Generate keypair'"
echo "  3. Fund with Friendbot"
echo "  4. Copy the PUBLIC KEY → put in backend/.env as MXNE_ISSUER=G..."
echo "  5. Keep the SECRET KEY safe (issuer signs nothing in normal flow)"
echo ""

echo -e "${BOLD}━━ B. Fund Customer & Merchant Wallets ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [[ -n "${CUSTOMER_PUBKEY:-}" ]]; then
  echo "  Customer wallet: $CUSTOMER_PUBKEY"
  info "Funding customer with Friendbot…"
  FUND=$(curl -sf "https://friendbot.stellar.org?addr=$CUSTOMER_PUBKEY" 2>/dev/null | jq -r '.hash // "already funded"')
  ok "Customer funded: $FUND"
fi
if [[ -n "${MERCHANT_PUBKEY:-}" ]]; then
  echo "  Merchant wallet: $MERCHANT_PUBKEY"
  info "Funding merchant with Friendbot…"
  FUND=$(curl -sf "https://friendbot.stellar.org?addr=$MERCHANT_PUBKEY" 2>/dev/null | jq -r '.hash // "already funded"')
  ok "Merchant funded: $FUND"
fi
echo ""

echo -e "${BOLD}━━ C. Establish Trustlines & Fund MXNe (JS one-liner) ━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Run this in Node.js (npm install @stellar/stellar-sdk first):"
echo ""
cat << 'NODESCRIPT'
const StellarSdk = require('@stellar/stellar-sdk');
const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');

const ISSUER_SECRET  = 'S_ISSUER_SECRET_HERE';   // your issuer S...
const CUSTOMER_PUBKEY = 'G_CUSTOMER_PUBKEY_HERE'; // from step 3 above
const MERCHANT_PUBKEY = 'G_MERCHANT_PUBKEY_HERE'; // from step 3 above
const ASSET = new StellarSdk.Asset('MXNe', StellarSdk.Keypair.fromSecret(ISSUER_SECRET).publicKey());
const AMOUNT = '1000'; // test MXNe

async function setup() {
  const issuerKp = StellarSdk.Keypair.fromSecret(ISSUER_SECRET);
  const issuer   = await server.loadAccount(issuerKp.publicKey());

  // Build tx: change trust + payment for both wallets
  const ops = [
    StellarSdk.Operation.changeTrust({ asset: ASSET, source: CUSTOMER_PUBKEY }),
    StellarSdk.Operation.changeTrust({ asset: ASSET, source: MERCHANT_PUBKEY }),
    StellarSdk.Operation.payment({ destination: CUSTOMER_PUBKEY, asset: ASSET, amount: AMOUNT }),
    StellarSdk.Operation.payment({ destination: MERCHANT_PUBKEY, asset: ASSET, amount: '100' }),
  ];

  const tx = new StellarSdk.TransactionBuilder(issuer, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  }).add(...ops).setTimeout(30).build();

  // Sign with issuer + both wallets (for changeTrust)
  // For simplicity use Stellar laboratory: https://laboratory.stellar.org/#txbuilder
  console.log('XDR:', tx.toXDR());
}
setup().catch(console.error);
NODESCRIPT

echo ""
echo -e "${BOLD}━━ D. Alternatively — use Stellar Laboratory ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  https://laboratory.stellar.org/#txbuilder?network=test"
echo "  Add operations:"
echo "    - Change Trust (customer wallet → MXNe issuer)"
echo "    - Change Trust (merchant wallet → MXNe issuer)"
echo "    - Payment (issuer → customer, 1000 MXNe)"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3 – Smoke test
# ══════════════════════════════════════════════════════════════════════════════

echo -e "${BOLD}━━ E. Test end-to-end payment ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  Run the smoke test:"
echo "  bash scripts/smoke_test.sh"
echo ""

if [[ -n "${MERCHANT_TOKEN:-}" && -n "${CUSTOMER_TOKEN:-}" ]]; then
  echo -e "${BOLD}━━ Quick payment test ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  info "Generating QR for MXN \$50…"
  QR=$(curl -sf -X POST "$BACKEND/api/qr/generate" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $MERCHANT_TOKEN" \
    -d '{"amount_mxn":50.0,"description":"Test taco"}' 2>/dev/null || echo '{}')
  PAYMENT_ID=$(echo "$QR" | jq -r '.payment_id // empty')

  if [[ -n "$PAYMENT_ID" ]]; then
    ok "Payment intent created: $PAYMENT_ID"
    info "QR deep-link: safelytics://pay/$PAYMENT_ID"
    echo ""
    info "Sending payment (requires MXNe trustline + balance)…"
    RESULT=$(curl -sf -X POST "$BACKEND/api/payments/send" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $CUSTOMER_TOKEN" \
      -d "{\"payment_id\":\"$PAYMENT_ID\",\"confirm\":true}" 2>/dev/null || echo '{}')
    TX_HASH=$(echo "$RESULT" | jq -r '.stellar_tx_hash // empty')
    if [[ -n "$TX_HASH" ]]; then
      ok "Payment sent! Tx: $TX_HASH"
      echo "  https://stellar.expert/explorer/testnet/tx/$TX_HASH"
    else
      warn "Payment failed (expected if no trustline yet): $(echo "$RESULT" | jq -r '.error // .')"
    fi
  fi
fi

echo ""
ok "Setup complete. Backend API: $BACKEND"
echo ""
echo "  Customer token : ${CUSTOMER_TOKEN:-<start backend first>}"
echo "  Merchant token : ${MERCHANT_TOKEN:-<start backend first>}"
echo ""
