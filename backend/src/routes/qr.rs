use crate::{
    auth::{Claims, Role},
    error::{AppError, Result},
    models::PaymentIntent,
    AppState,
};
use axum::{
    extract::{Extension, Path, State},
    Json,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::{Duration, Utc};
use image::DynamicImage;
use qrcode::QrCode;
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use std::{io::Cursor, sync::Arc};

// ─── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct GenerateQrReq {
    /// Amount in MXN pesos (e.g. 150.00)
    pub amount_mxn: f64,
    pub description: Option<String>,
    /// TTL in minutes (default 10)
    pub expires_in_minutes: Option<i64>,
}

#[derive(Serialize)]
pub struct GenerateQrResp {
    pub payment_id: String,
    pub qr_png_b64: String,
    pub amount_mxn: f64,
    pub expires_at: String,
}

#[derive(Serialize)]
pub struct PaymentInfoResp {
    pub payment_id: String,
    pub merchant_name: String,
    pub amount_mxn: f64,
    pub description: Option<String>,
    pub expires_at: String,
    pub status: String,
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/// POST /api/qr/generate  (merchant only)
pub async fn generate_qr(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<GenerateQrReq>,
) -> Result<Json<GenerateQrResp>> {
    tracing::info!(
        merchant_id = %claims.sub,
        amount_mxn = body.amount_mxn,
        ttl_min = ?body.expires_in_minutes,
        "POST /api/qr/generate — nuevo cobro QR"
    );
    if claims.role != Role::Merchant {
        return Err(AppError::Unauthorized);
    }
    if body.amount_mxn <= 0.0 {
        return Err(AppError::BadRequest("amount must be > 0".into()));
    }

    let amount_stroops = (body.amount_mxn * 10_000_000.0).round() as i64;
    let ttl = body.expires_in_minutes.unwrap_or(10).max(1).min(60);
    let expires_at = Utc::now() + Duration::minutes(ttl);

    // Short random memo (8 alphanumeric chars) — stamped in Stellar tx
    let memo: String =
        rand::thread_rng().sample_iter(&Alphanumeric).take(8).map(char::from).collect();

    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO payment_intents (id, merchant_id, amount_stroops, description, memo, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&claims.sub)
    .bind(amount_stroops)
    .bind(&body.description)
    .bind(&memo)
    .bind(expires_at.naive_utc())
    .execute(&state.db)
    .await?;

    // QR data: a deep-link the mobile app handles
    let qr_data = format!("safelytics://pay/{}", id);
    let qr_png_b64 = encode_qr_png(&qr_data)?;

    tracing::info!(
        payment_intent_id = %id,
        memo = %memo,
        stroops = amount_stroops,
        "Intent de pago creado, PNG QR generado"
    );

    Ok(Json(GenerateQrResp {
        payment_id: id,
        qr_png_b64,
        amount_mxn: body.amount_mxn,
        expires_at: expires_at.to_rfc3339(),
    }))
}

/// GET /api/qr/:payment_id  (public — customer app calls this after scanning)
pub async fn get_payment_info(
    State(state): State<Arc<AppState>>,
    Path(payment_id): Path<String>,
) -> Result<Json<PaymentInfoResp>> {
    tracing::info!(%payment_id, "GET /api/qr/:id — consulta pública de cobro");
    let intent = sqlx::query_as::<_, PaymentIntent>("SELECT * FROM payment_intents WHERE id = ?")
        .bind(&payment_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    // Validate not expired or already used
    let now = Utc::now().naive_utc();
    if intent.expires_at < now && intent.status == "pending" {
        tracing::warn!(%payment_id, "Intent marcado como expirado");
        sqlx::query("UPDATE payment_intents SET status = 'expired' WHERE id = ?")
            .bind(&payment_id)
            .execute(&state.db)
            .await?;
        return Err(AppError::BadRequest("payment intent expired".into()));
    }

    let merchant =
        sqlx::query_as::<_, crate::models::Merchant>("SELECT * FROM merchants WHERE id = ?")
            .bind(&intent.merchant_id)
            .fetch_one(&state.db)
            .await?;

    tracing::info!(
        %payment_id,
        merchant = %merchant.business_name,
        status = %intent.status,
        "Detalle de cobro listo para el cliente"
    );

    Ok(Json(PaymentInfoResp {
        payment_id: intent.id,
        merchant_name: merchant.business_name,
        amount_mxn: intent.amount_stroops as f64 / 10_000_000.0,
        description: intent.description,
        expires_at: intent.expires_at.to_string(),
        status: intent.status,
    }))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn encode_qr_png(data: &str) -> Result<String> {
    let code = QrCode::new(data.as_bytes())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("qr encode: {e}")))?;

    let img = code.render::<image::Luma<u8>>().quiet_zone(true).module_dimensions(8, 8).build();

    let dynamic = DynamicImage::ImageLuma8(img);
    let mut buf = Vec::new();
    dynamic
        .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("png encode: {e}")))?;

    Ok(B64.encode(&buf))
}
