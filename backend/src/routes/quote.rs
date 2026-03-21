//! Cotización pública para UX “solo MXN”: comisión PagaLoop + equivalente USDC referencial.
//! El pago on-chain sigue siendo el activo configurado (p. ej. MXNe testnet) hasta integrar path payments.

use crate::{
    error::{AppError, Result},
    models::PaymentIntent,
    AppState,
};
use axum::{
    extract::{Path, State},
    Json,
};
use chrono::Utc;
use serde::Serialize;
use std::sync::Arc;

#[derive(Serialize)]
pub struct PaymentQuoteResp {
    pub payment_id: String,
    pub amount_mxn: f64,
    /// Lo que ve el cliente a pagar (hoy = monto del cobro).
    pub customer_pays_mxn: f64,
    pub platform_fee_bps: u64,
    pub platform_fee_mxn: f64,
    /// Estimado neto para el comercio si la comisión se descuenta del bruto (modelo documentado).
    pub merchant_receives_mxn: f64,
    /// Equivalente referencial en USDC (oracle estático / env; no precio de mercado en tiempo real).
    pub stablecoin_reference_usdc: f64,
    pub reference_mxn_per_usdc: f64,
    pub disclaimer_es: String,
}

/// GET /api/qr/:payment_id/quote — desglose para pantalla de confirmación (sin auth).
pub async fn payment_quote(
    State(state): State<Arc<AppState>>,
    Path(payment_id): Path<String>,
) -> Result<Json<PaymentQuoteResp>> {
    let intent = sqlx::query_as::<_, PaymentIntent>("SELECT * FROM payment_intents WHERE id = ?")
        .bind(&payment_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let now = Utc::now().naive_utc();
    if intent.status != "pending" {
        return Err(AppError::BadRequest("Este cobro ya no está pendiente".into()));
    }
    if intent.expires_at < now {
        return Err(AppError::BadRequest("Este cobro expiró".into()));
    }

    let amount_mxn = intent.amount_stroops as f64 / 10_000_000.0;
    let fee_fraction = state.config.fee_bps as f64 / 10_000.0;
    let platform_fee_mxn = ((amount_mxn * fee_fraction) * 100.0).round() / 100.0;
    let merchant_receives_mxn = (amount_mxn - platform_fee_mxn).max(0.0);

    let rate = state.config.reference_mxn_per_usdc;
    let stablecoin_reference_usdc = (amount_mxn / rate * 1_000_000.0).round() / 1_000_000.0;

    Ok(Json(PaymentQuoteResp {
        payment_id: intent.id,
        amount_mxn,
        customer_pays_mxn: amount_mxn,
        platform_fee_bps: state.config.fee_bps,
        platform_fee_mxn,
        merchant_receives_mxn,
        stablecoin_reference_usdc,
        reference_mxn_per_usdc: rate,
        disclaimer_es: "PagaLoop: ves pesos. El equivalente USDC es referencia (REFERENCE_MXN_PER_USDC). \
            Si PLATFORM_FEE_RECEIVER está configurado y hay comisión, un solo envío Stellar parte el MXNe: \
            neto al comercio y fee a la wallet de plataforma. Path payments, sponsor de fees XLM y SPEI: siguientes fases."
            .into(),
    }))
}
