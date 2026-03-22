//! Transferencias bancarias salientes:
//! deduce MXNe del wallet Stellar del usuario y envía SPEI a la CLABE destino via OpenPay.

use crate::{
    auth::{Claims, Role},
    error::{AppError, Result},
    models::{BankTransfer, User},
    openpay::OpenPayClient,
    stellar::{self, StellarPaymentRequest},
    AppState,
};
use axum::{
    extract::{Extension, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn require_user(claims: &Claims) -> Result<()> {
    if claims.role != Role::User {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

fn make_openpay(state: &AppState) -> Result<OpenPayClient> {
    let mid = state.config.openpay_merchant_id.as_deref().ok_or_else(|| {
        AppError::BadRequest("OPENPAY_MERCHANT_ID no configurado en el servidor".into())
    })?;
    let key = state.config.openpay_private_key.as_deref().ok_or_else(|| {
        AppError::BadRequest("OPENPAY_PRIVATE_KEY no configurado en el servidor".into())
    })?;
    Ok(OpenPayClient::new(mid, key, state.config.openpay_sandbox))
}

fn validate_clabe(clabe: &str) -> bool {
    let c = clabe.trim();
    c.len() == 18 && c.chars().all(|ch| ch.is_ascii_digit())
}

// ─── POST /api/wallet/transfer/bank ──────────────────────────────────────────

#[derive(Deserialize)]
pub struct BankTransferReq {
    /// CLABE interbancaria del destinatario (18 dígitos).
    pub destination_clabe: String,
    /// Nombre del titular de la cuenta destino.
    pub holder_name: String,
    pub amount_mxn: f64,
    pub description: Option<String>,
}

#[derive(Serialize)]
pub struct BankTransferResp {
    pub transfer_id: String,
    pub openpay_id: Option<String>,
    pub stellar_tx_hash: String,
    pub amount_mxn: f64,
    pub destination_clabe: String,
    pub status: String,
}

/// Transfiere MXN a una CLABE bancaria:
/// 1. Deduce MXNe del wallet Stellar del usuario (envía al wallet de plataforma).
/// 2. Crea un payout SPEI en OpenPay hacia la CLABE destino.
pub async fn bank_transfer(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<BankTransferReq>,
) -> Result<Json<BankTransferResp>> {
    require_user(&claims)?;

    let clabe = body.destination_clabe.trim().to_string();
    if !validate_clabe(&clabe) {
        return Err(AppError::BadRequest(
            "CLABE inválida: debe tener exactamente 18 dígitos".into(),
        ));
    }
    if body.holder_name.trim().is_empty() {
        return Err(AppError::BadRequest("Nombre del titular requerido".into()));
    }
    if body.amount_mxn < 1.0 {
        return Err(AppError::BadRequest("Monto mínimo: $1 MXN".into()));
    }
    if body.amount_mxn > 200_000.0 {
        return Err(AppError::BadRequest("Monto máximo: $200,000 MXN".into()));
    }

    let platform_wallet = state.config.platform_fee_receiver.as_deref().ok_or_else(|| {
        AppError::BadRequest(
            "PLATFORM_FEE_RECEIVER no configurado (wallet de plataforma requerido)".into(),
        )
    })?;

    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = ?")
        .bind(&claims.sub)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let amount_stroops = (body.amount_mxn * 10_000_000.0).round() as i64;
    let transfer_id = Uuid::new_v4().to_string();
    let description = body
        .description
        .as_deref()
        .unwrap_or("Transferencia Safelytics")
        .to_string();

    // ── Paso 1: deducir MXNe del wallet Stellar del usuario ──────────────────
    let stellar_tx_hash = stellar::execute_payment(StellarPaymentRequest {
        source_encrypted_secret: &user.stellar_secret_encrypted,
        destination: platform_wallet,
        amount_stroops,
        memo: "TRANSFER",
        config: &state.config,
    })
    .await
    .map_err(|e| AppError::Stellar(e.to_string()))?;

    tracing::info!(
        transfer_id = %transfer_id,
        user_id = %claims.sub,
        amount_mxn = body.amount_mxn,
        stellar_tx = %stellar_tx_hash,
        "MXNe deducido del wallet — iniciando payout SPEI"
    );

    // ── Paso 2: crear payout SPEI en OpenPay ─────────────────────────────────
    let openpay = make_openpay(&state)?;
    let payout_result = openpay
        .create_payout(
            &transfer_id,
            body.amount_mxn,
            &description,
            &clabe,
            body.holder_name.trim(),
        )
        .await;

    let (openpay_id, final_status) = match payout_result {
        Ok(p) => {
            tracing::info!(
                transfer_id = %transfer_id,
                openpay_id = %p.id,
                "Payout SPEI creado en OpenPay"
            );
            (Some(p.id), "processing".to_string())
        }
        Err(e) => {
            // El MXNe ya fue deducido — registrar como fallido para revisión manual
            tracing::error!(
                transfer_id = %transfer_id,
                error = %e,
                "Payout OpenPay falló; MXNe deducido pero SPEI no enviado — requiere revisión"
            );
            (None, "failed_payout".to_string())
        }
    };

    // ── Paso 3: registrar en BD ───────────────────────────────────────────────
    sqlx::query(
        "INSERT INTO bank_transfers
         (id, user_id, amount_stroops, destination_clabe, holder_name, description,
          openpay_id, stellar_tx_hash, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&transfer_id)
    .bind(&claims.sub)
    .bind(amount_stroops)
    .bind(&clabe)
    .bind(body.holder_name.trim())
    .bind(&description)
    .bind(&openpay_id)
    .bind(&stellar_tx_hash)
    .bind(&final_status)
    .execute(&state.db)
    .await?;

    Ok(Json(BankTransferResp {
        transfer_id,
        openpay_id,
        stellar_tx_hash,
        amount_mxn: body.amount_mxn,
        destination_clabe: clabe,
        status: final_status,
    }))
}

// ─── GET /api/wallet/transfers ────────────────────────────────────────────────

#[derive(Serialize)]
pub struct TransferHistoryItem {
    pub transfer_id: String,
    pub amount_mxn: f64,
    pub destination_clabe: String,
    pub holder_name: String,
    pub status: String,
    pub stellar_tx_hash: Option<String>,
    pub description: Option<String>,
    pub created_at: String,
}

/// Lista las transferencias bancarias salientes del usuario autenticado.
pub async fn list_transfers(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<TransferHistoryItem>>> {
    require_user(&claims)?;

    let rows = sqlx::query_as::<_, BankTransfer>(
        "SELECT * FROM bank_transfers WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    )
    .bind(&claims.sub)
    .fetch_all(&state.db)
    .await?;

    let items = rows
        .iter()
        .map(|r| TransferHistoryItem {
            transfer_id: r.id.clone(),
            amount_mxn: r.amount_stroops as f64 / 10_000_000.0,
            destination_clabe: r.destination_clabe.clone(),
            holder_name: r.holder_name.clone(),
            status: r.status.clone(),
            stellar_tx_hash: r.stellar_tx_hash.clone(),
            description: r.description.clone(),
            created_at: r.created_at.map(|d| d.to_string()).unwrap_or_default(),
        })
        .collect();

    Ok(Json(items))
}
