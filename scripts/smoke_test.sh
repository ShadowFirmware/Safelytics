#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Smoke test against a running local backend (http://localhost:8080)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE="http://localhost:8080"
H="Content-Type: application/json"

echo "── 1. Register merchant ───────────────────────────────────────────────"
MERCHANT=$(curl -sf -X POST "$BASE/api/auth/merchant/register" -H "$H" -d '{
  "business_name": "Taquería El Compa",
  "phone": "+525511112222",
  "password": "supersecreto123"
}')
echo "$MERCHANT" | jq .
MERCHANT_TOKEN=$(echo "$MERCHANT" | jq -r .token)

echo ""
echo "── 2. Register customer ───────────────────────────────────────────────"
USER=$(curl -sf -X POST "$BASE/api/auth/register" -H "$H" -d '{
  "phone": "+525599998888",
  "name": "Juan López",
  "password": "mi_clave_456"
}')
echo "$USER" | jq .
USER_TOKEN=$(echo "$USER" | jq -r .token)

echo ""
echo "── 3. Generate QR (merchant) ──────────────────────────────────────────"
QR=$(curl -sf -X POST "$BASE/api/qr/generate" \
  -H "$H" -H "Authorization: Bearer $MERCHANT_TOKEN" \
  -d '{"amount_mxn": 50.00, "description": "2 tacos al pastor"}')
echo "$QR" | jq 'del(.qr_png_b64)'
PAYMENT_ID=$(echo "$QR" | jq -r .payment_id)

echo ""
echo "── 4. Customer fetches payment info ──────────────────────────────────"
curl -sf "$BASE/api/qr/$PAYMENT_ID" | jq .

echo ""
echo "── 5. Merchant balance ────────────────────────────────────────────────"
curl -sf "$BASE/api/merchant/balance" \
  -H "Authorization: Bearer $MERCHANT_TOKEN" | jq .

echo ""
echo "── 6. Send payment (customer) ─────────────────────────────────────────"
echo "NOTE: This will fail unless the customer wallet has MXNe + trustline."
echo "      Run scripts/setup_testnet.sh for instructions."
RESULT=$(curl -sf -X POST "$BASE/api/payments/send" \
  -H "$H" -H "Authorization: Bearer $USER_TOKEN" \
  -d "{\"payment_id\": \"$PAYMENT_ID\", \"confirm\": true}" 2>&1 || true)
echo "$RESULT"

echo ""
echo "── 7. Payment history (customer) ─────────────────────────────────────"
curl -sf "$BASE/api/payments/history" \
  -H "Authorization: Bearer $USER_TOKEN" | jq .

echo ""
echo "✓ Smoke test complete"
