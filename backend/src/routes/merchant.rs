use crate::{
    auth::{Claims, Role},
    error::{AppError, Result},
    models::BalanceResponse,
    stellar::{self, horizon::HorizonClient, strkey},
    AppState,
};
use axum::{
    extract::{Extension, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

// ─── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct MerchantProfileResp {
    pub id: String,
    pub business_name: String,
    pub phone: String,
    pub public_key: String,
}

#[derive(Deserialize)]
pub struct WithdrawReq {
    pub amount_mxn: f64,
    /// CLABE or IBAN (for anchor wire-out — placeholder for now)
    pub bank_account: String,
}

#[derive(Serialize)]
pub struct WithdrawResp {
    pub status: String,
    pub message: String,
    pub withdrawal_id: String,
}

#[derive(Deserialize)]
pub struct WithdrawStellarReq {
    /// Dirección Stellar G... destino (exchange u otra wallet).
    pub destination: String,
    pub amount_mxn: f64,
}

#[derive(Serialize)]
pub struct WithdrawStellarResp {
    pub stellar_tx_hash: String,
    pub amount_mxn: f64,
    pub destination: String,
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/// GET /api/merchant/me
pub async fn merchant_profile(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<MerchantProfileResp>> {
    tracing::info!(merchant_id = %claims.sub, "GET /api/merchant/me");
    require_merchant(&claims)?;
    let m = sqlx::query_as::<_, crate::models::Merchant>("SELECT * FROM merchants WHERE id = ?")
        .bind(&claims.sub)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(MerchantProfileResp {
        id: m.id,
        business_name: m.business_name,
        phone: m.phone,
        public_key: m.stellar_public_key,
    }))
}

/// GET /api/merchant/balance  — live MXNe balance from Horizon
pub async fn merchant_balance(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<BalanceResponse>> {
    tracing::info!(merchant_id = %claims.sub, "GET /api/merchant/balance — consulta Horizon");
    require_merchant(&claims)?;
    let m = sqlx::query_as::<_, crate::models::Merchant>("SELECT * FROM merchants WHERE id = ?")
        .bind(&claims.sub)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let horizon = HorizonClient::new(&state.config.horizon_url);
    let balance = horizon
        .mxne_balance(
            &m.stellar_public_key,
            &state.config.mxne_asset_code,
            &state.config.mxne_issuer,
        )
        .await
        .map_err(|e| AppError::Stellar(e.to_string()))?;

    tracing::info!(
        merchant_id = %claims.sub,
        mxne_balance = balance,
        "Saldo MXNe obtenido"
    );

    Ok(Json(BalanceResponse { public_key: m.stellar_public_key, mxne_balance: balance }))
}

/// POST /api/merchant/withdraw — solicitud de retiro a banco (registro en BD; procesamiento manual / anchor).
pub async fn withdraw(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<WithdrawReq>,
) -> Result<Json<WithdrawResp>> {
    require_merchant(&claims)?;
    if body.amount_mxn <= 0.0 {
        return Err(AppError::BadRequest("amount must be > 0".into()));
    }
    if body.bank_account.trim().is_empty() {
        return Err(AppError::BadRequest("bank_account requerido".into()));
    }

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO withdrawal_requests (id, merchant_id, amount_mxn, bank_account, status)
         VALUES (?, ?, ?, ?, 'pending')",
    )
    .bind(&id)
    .bind(&claims.sub)
    .bind(body.amount_mxn)
    .bind(body.bank_account.trim())
    .execute(&state.db)
    .await?;

    tracing::info!(
        withdrawal_id = %id,
        merchant_id = %claims.sub,
        amount_mxn  = body.amount_mxn,
        "Retiro bancario registrado (pending)"
    );

    Ok(Json(WithdrawResp {
        status: "pending".into(),
        message:
            "Solicitud registrada. En testnet es simulación; en producción iría a un anchor/SPEI."
                .into(),
        withdrawal_id: id,
    }))
}

/// POST /api/merchant/withdraw-stellar — envía MXNe on-chain a otra dirección G...
pub async fn withdraw_stellar(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<WithdrawStellarReq>,
) -> Result<Json<WithdrawStellarResp>> {
    require_merchant(&claims)?;
    strkey::decode_address(body.destination.trim()).map_err(|_| {
        AppError::BadRequest("destination debe ser una dirección Stellar G... válida".into())
    })?;

    if body.amount_mxn <= 0.0 {
        return Err(AppError::BadRequest("amount_mxn debe ser > 0".into()));
    }

    let m = sqlx::query_as::<_, crate::models::Merchant>("SELECT * FROM merchants WHERE id = ?")
        .bind(&claims.sub)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let stroops = (body.amount_mxn * 10_000_000.0).round() as i64;
    let dest = body.destination.trim();

    let tx_hash = stellar::execute_payment(stellar::StellarPaymentRequest {
        source_encrypted_secret: &m.stellar_secret_encrypted,
        destination: dest,
        amount_stroops: stroops,
        memo: "WITHDRAW",
        config: &state.config,
    })
    .await
    .map_err(|e| AppError::Stellar(e.to_string()))?;

    tracing::info!(
        merchant_id = %claims.sub,
        %tx_hash,
        amount_mxn = body.amount_mxn,
        %dest,
        "Retiro Stellar enviado"
    );

    Ok(Json(WithdrawStellarResp {
        stellar_tx_hash: tx_hash,
        amount_mxn: body.amount_mxn,
        destination: dest.to_string(),
    }))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn require_merchant(claims: &Claims) -> Result<()> {
    if claims.role != Role::Merchant {
        Err(AppError::Unauthorized)
    } else {
        Ok(())
    }
}
