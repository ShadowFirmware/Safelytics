//! Recargas SPEI: genera CLABE OpenPay, webhook de confirmación y consulta de estado.

use crate::{
    auth::{Claims, Role},
    error::{AppError, Result},
    models::{DepositRequest, User},
    openpay::OpenPayClient,
    stellar,
    AppState,
};
use axum::{
    extract::{Extension, Path, State},
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

// ─── POST /api/wallet/deposit/create ─────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateDepositReq {
    pub amount_mxn: f64,
}

#[derive(Serialize)]
pub struct CreateDepositResp {
    pub deposit_id: String,
    pub clabe: String,
    pub bank_name: String,
    pub amount_mxn: f64,
    pub status: String,
    pub instructions: String,
}

/// Genera una CLABE SPEI de OpenPay para que el usuario deposite MXN.
/// Al recibir el pago, el webhook acreditará MXNe al wallet Stellar del usuario.
pub async fn create_deposit(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateDepositReq>,
) -> Result<Json<CreateDepositResp>> {
    require_user(&claims)?;

    if body.amount_mxn < 10.0 {
        return Err(AppError::BadRequest("Monto mínimo de recarga: $10 MXN".into()));
    }
    if body.amount_mxn > 100_000.0 {
        return Err(AppError::BadRequest("Monto máximo de recarga: $100,000 MXN".into()));
    }

    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = ?")
        .bind(&claims.sub)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let deposit_id = Uuid::new_v4().to_string();
    let openpay = make_openpay(&state)?;

    let charge = openpay
        .create_spei_charge(
            &deposit_id,
            body.amount_mxn,
            &format!("Recarga Safelytics ${:.2} MXN", body.amount_mxn),
            &user.name,
            &user.phone,
        )
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let clabe = charge
        .payment_method
        .as_ref()
        .and_then(|pm| pm.clabe.clone())
        .unwrap_or_default();

    let bank_name = charge
        .payment_method
        .as_ref()
        .and_then(|pm| pm.name.clone())
        .unwrap_or_else(|| "STP / BBVA".into());

    let amount_stroops = (body.amount_mxn * 10_000_000.0).round() as i64;

    sqlx::query(
        "INSERT INTO deposit_requests
         (id, user_id, amount_stroops, openpay_id, clabe, bank_name, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')",
    )
    .bind(&deposit_id)
    .bind(&claims.sub)
    .bind(amount_stroops)
    .bind(&charge.id)
    .bind(&clabe)
    .bind(&bank_name)
    .execute(&state.db)
    .await?;

    tracing::info!(
        deposit_id = %deposit_id,
        user_id = %claims.sub,
        amount_mxn = body.amount_mxn,
        clabe = %clabe,
        "Recarga SPEI creada en OpenPay"
    );

    Ok(Json(CreateDepositResp {
        deposit_id,
        clabe,
        bank_name,
        amount_mxn: body.amount_mxn,
        status: "pending".into(),
        instructions: format!(
            "Transfiere exactamente ${:.2} MXN a la CLABE mostrada. \
             Tu saldo MXNe se acreditará automáticamente al confirmar el pago.",
            body.amount_mxn
        ),
    }))
}

// ─── GET /api/wallet/deposit/:id ─────────────────────────────────────────────

#[derive(Serialize)]
pub struct DepositStatusResp {
    pub deposit_id: String,
    pub amount_mxn: f64,
    pub clabe: Option<String>,
    pub bank_name: Option<String>,
    pub status: String,
    pub stellar_tx_hash: Option<String>,
    pub created_at: String,
}

/// Consulta el estado de una recarga SPEI del usuario autenticado.
pub async fn deposit_status(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<Json<DepositStatusResp>> {
    require_user(&claims)?;

    let row = sqlx::query_as::<_, DepositRequest>(
        "SELECT * FROM deposit_requests WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    if row.user_id != claims.sub {
        return Err(AppError::Unauthorized);
    }

    Ok(Json(DepositStatusResp {
        deposit_id: row.id,
        amount_mxn: row.amount_stroops as f64 / 10_000_000.0,
        clabe: row.clabe,
        bank_name: row.bank_name,
        status: row.status,
        stellar_tx_hash: row.stellar_tx_hash,
        created_at: row.created_at.map(|d| d.to_string()).unwrap_or_default(),
    }))
}

// ─── GET /api/wallet/deposits ─────────────────────────────────────────────────

/// Lista todas las recargas del usuario autenticado.
pub async fn list_deposits(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<DepositStatusResp>>> {
    require_user(&claims)?;

    let rows = sqlx::query_as::<_, DepositRequest>(
        "SELECT * FROM deposit_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    )
    .bind(&claims.sub)
    .fetch_all(&state.db)
    .await?;

    let items = rows
        .iter()
        .map(|r| DepositStatusResp {
            deposit_id: r.id.clone(),
            amount_mxn: r.amount_stroops as f64 / 10_000_000.0,
            clabe: r.clabe.clone(),
            bank_name: r.bank_name.clone(),
            status: r.status.clone(),
            stellar_tx_hash: r.stellar_tx_hash.clone(),
            created_at: r.created_at.map(|d| d.to_string()).unwrap_or_default(),
        })
        .collect();

    Ok(Json(items))
}

// ─── POST /api/wallet/deposit/webhook (PÚBLICO) ───────────────────────────────

/// Recibe eventos de OpenPay. Cuando un cargo SPEI se completa,
/// acredita MXNe al wallet Stellar del usuario.
///
/// OpenPay envía `POST` con JSON:
/// ```json
/// { "type": "charge.succeeded", "data": { "object": { ... } } }
/// ```
/// Para verificar la URL envía `{ "verification_code": "abc" }` → respondemos igual.
pub async fn deposit_webhook(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    // Verificación inicial de URL por parte de OpenPay
    if let Some(code) = body.get("verification_code").and_then(|v| v.as_str()) {
        tracing::info!("OpenPay webhook — verificación de URL: {}", code);
        return Ok(Json(serde_json::json!({ "verification_code": code })));
    }

    let event_type = body
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    tracing::info!(event_type = %event_type, "OpenPay webhook recibido");

    if event_type != "charge.succeeded" {
        return Ok(Json(serde_json::json!({ "ok": true, "skipped": true })));
    }

    let charge_obj = body
        .get("data")
        .and_then(|d| d.get("object"))
        .cloned()
        .unwrap_or_default();

    let order_id = charge_obj
        .get("order_id")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    let operation_type = charge_obj
        .get("operation_type")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    let status = charge_obj
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    // Solo procesamos cargos entrantes completados
    if operation_type != "in" || status != "completed" || order_id.is_empty() {
        return Ok(Json(serde_json::json!({ "ok": true })));
    }

    // Buscar la recarga pendiente por su UUID (que usamos como order_id en OpenPay)
    let row_opt = sqlx::query_as::<_, DepositRequest>(
        "SELECT * FROM deposit_requests WHERE id = ? AND status = 'pending'",
    )
    .bind(order_id)
    .fetch_optional(&state.db)
    .await?;

    let Some(row) = row_opt else {
        tracing::warn!(order_id = %order_id, "Recarga no encontrada o ya procesada");
        return Ok(Json(serde_json::json!({ "ok": true })));
    };

    // Cargar usuario
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = ?")
        .bind(&row.user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    // Necesitamos el secreto del emisor MXNe para acreditar los tokens
    let issuer_secret = state
        .config
        .mxne_issuer_secret
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("MXNE_ISSUER_SECRET no configurado".into()))?;

    match stellar::execute_issuer_to_destination(
        issuer_secret,
        &user.stellar_public_key,
        row.amount_stroops,
        "DEPOSIT",
        &state.config,
    )
    .await
    {
        Ok(tx_hash) => {
            sqlx::query(
                "UPDATE deposit_requests SET status = 'completed', stellar_tx_hash = ? WHERE id = ?",
            )
            .bind(&tx_hash)
            .bind(&row.id)
            .execute(&state.db)
            .await?;

            tracing::info!(
                deposit_id = %row.id,
                user_id = %row.user_id,
                amount_mxn = row.amount_stroops as f64 / 10_000_000.0,
                tx_hash = %tx_hash,
                "Recarga completada — MXNe acreditado al wallet Stellar"
            );
        }
        Err(e) => {
            tracing::error!(deposit_id = %row.id, error = %e, "Error al acreditar MXNe en Stellar");
            sqlx::query(
                "UPDATE deposit_requests SET status = 'failed' WHERE id = ?",
            )
            .bind(&row.id)
            .execute(&state.db)
            .await?;
        }
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}
