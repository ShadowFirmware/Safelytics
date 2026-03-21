use chrono::NaiveDateTime;
use serde::Serialize;
use sqlx::FromRow;

// ── Users ────────────────────────────────────────────────────────────────────

/// Fila `users`; todos los campos coinciden con columnas SQLx (algunos aún no se exponen en API).
#[allow(dead_code)]
#[derive(Debug, FromRow)]
pub struct User {
    pub id: String,
    pub phone: String,
    pub name: String,
    pub password_hash: String,
    pub stellar_public_key: String,
    pub stellar_secret_encrypted: String,
    pub created_at: Option<NaiveDateTime>,
}

// ── Merchants ────────────────────────────────────────────────────────────────

#[allow(dead_code)]
#[derive(Debug, FromRow)]
pub struct Merchant {
    pub id: String,
    pub business_name: String,
    pub phone: String,
    pub password_hash: String,
    pub stellar_public_key: String,
    pub stellar_secret_encrypted: String,
    pub created_at: Option<NaiveDateTime>,
}

// ── Payment intents ──────────────────────────────────────────────────────────

#[allow(dead_code)]
#[derive(Debug, FromRow)]
pub struct PaymentIntent {
    pub id: String,
    pub merchant_id: String,
    pub amount_stroops: i64,
    pub description: Option<String>,
    pub memo: String,
    pub status: String,
    pub expires_at: NaiveDateTime,
    pub created_at: Option<NaiveDateTime>,
}

// ── Payments ──────────────────────────────────────────────────────────────────

#[derive(Debug, FromRow)]
pub struct Payment {
    pub id: String,
    pub payment_intent_id: String,
    pub customer_id: String,
    /// Total MXNe movidos desde el cliente (bruto del cobro).
    pub amount_stroops: i64,
    pub platform_fee_stroops: i64,
    pub merchant_net_stroops: i64,
    pub stellar_tx_hash: Option<String>,
    pub status: String,
    pub created_at: Option<NaiveDateTime>,
}

// ── Shared response DTOs ──────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct BalanceResponse {
    pub public_key: String,
    pub mxne_balance: f64,
}

#[derive(Serialize)]
pub struct TxHistoryItem {
    pub id: String,
    /// Total cobrado al cliente (MXNe).
    pub amount_mxn: f64,
    pub status: String,
    pub stellar_tx_hash: Option<String>,
    pub created_at: String,
    /// Comisión PagaLoop en MXNe (si hubo split on-chain).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform_fee_mxn: Option<f64>,
    /// Neto que recibió el comercio (MXNe).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merchant_net_mxn: Option<f64>,
}

impl From<&Payment> for TxHistoryItem {
    fn from(p: &Payment) -> Self {
        let split = p.platform_fee_stroops > 0;
        TxHistoryItem {
            id: p.id.clone(),
            amount_mxn: p.amount_stroops as f64 / 10_000_000.0,
            status: p.status.clone(),
            stellar_tx_hash: p.stellar_tx_hash.clone(),
            created_at: p.created_at.map(|d| d.to_string()).unwrap_or_default(),
            platform_fee_mxn: if split {
                Some(p.platform_fee_stroops as f64 / 10_000_000.0)
            } else {
                None
            },
            merchant_net_mxn: if split {
                Some(p.merchant_net_stroops as f64 / 10_000_000.0)
            } else {
                None
            },
        }
    }
}
