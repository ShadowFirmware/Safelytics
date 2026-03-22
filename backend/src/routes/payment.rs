use crate::{
    auth::{Claims, Role},
    error::{AppError, Result},
    models::{Payment, PaymentIntent, TxHistoryItem},
    stellar, AppState,
};
use axum::{
    extract::{Extension, Path, State},
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

// ─── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SendPaymentReq {
    pub payment_id: String,
    /// Must be true — explicit confirmation from the user
    pub confirm: bool,
}

#[derive(Serialize)]
pub struct SendPaymentResp {
    pub payment_id: String,
    pub stellar_tx_hash: String,
    pub amount_mxn: f64,
    pub status: String,
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/// POST /api/payments/send  (customer only)
///
/// Full flow:
/// 1. Load + validate payment intent.
/// 2. Load customer's encrypted Stellar secret.
/// 3. Execute Stellar payment (MXNe customer → merchant wallet).
/// 4. Record payment in DB, mark intent as completed.
pub async fn send_payment(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<SendPaymentReq>,
) -> Result<Json<SendPaymentResp>> {
    tracing::info!(
        customer_id = %claims.sub,
        payment_intent_id = %body.payment_id,
        confirm = body.confirm,
        "POST /api/payments/send — inicio de pago"
    );
    if claims.role != Role::User {
        return Err(AppError::Unauthorized);
    }
    if !body.confirm {
        return Err(AppError::BadRequest("confirm must be true".into()));
    }

    // ── Load + validate intent ────────────────────────────────────────────
    let intent = sqlx::query_as::<_, PaymentIntent>(
        "SELECT * FROM payment_intents WHERE id = ? AND status = 'pending'",
    )
    .bind(&body.payment_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound)?;

    let now = Utc::now().naive_utc();
    if intent.expires_at < now {
        tracing::warn!(intent_id = %intent.id, "Intent expirado al intentar pagar");
        sqlx::query("UPDATE payment_intents SET status = 'expired' WHERE id = ?")
            .bind(&intent.id)
            .execute(&state.db)
            .await?;
        return Err(AppError::BadRequest("payment intent expired".into()));
    }

    // ── Load wallets ──────────────────────────────────────────────────────
    let customer = sqlx::query_as::<_, crate::models::User>("SELECT * FROM users WHERE id = ?")
        .bind(&claims.sub)
        .fetch_one(&state.db)
        .await?;

    let merchant =
        sqlx::query_as::<_, crate::models::Merchant>("SELECT * FROM merchants WHERE id = ?")
            .bind(&intent.merchant_id)
            .fetch_one(&state.db)
            .await?;

    let total_stroops = intent.amount_stroops;
    let fee_stroops = (total_stroops * state.config.fee_bps as i64) / 10_000;
    let merchant_net_stroops = total_stroops - fee_stroops;

    let platform_g = state.config.platform_fee_receiver.as_deref();
    let use_split = fee_stroops > 0
        && merchant_net_stroops > 0
        && platform_g.is_some_and(|g| g != merchant.stellar_public_key.as_str());

    if fee_stroops > 0 && merchant_net_stroops <= 0 {
        return Err(AppError::BadRequest(
            "Monto demasiado pequeño: no cabe la comisión de plataforma".into(),
        ));
    }

    if fee_stroops > 0 && !use_split {
        tracing::warn!(
            "Comisión calculada ({} stroops) pero sin split: define PLATFORM_FEE_RECEIVER distinto al comercio; enviando íntegro al comercio",
            fee_stroops
        );
    }

    tracing::info!(
        intent_id = %intent.id,
        total_stroops,
        fee_stroops,
        merchant_net_stroops,
        split = use_split,
        merchant_pk = %merchant.stellar_public_key,
        "Ejecutando pago Stellar"
    );

    // ── Create pending payment record ──────────────────────────────────────
    let payment_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO payments (id, payment_intent_id, customer_id, amount_stroops, platform_fee_stroops, merchant_net_stroops, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')",
    )
    .bind(&payment_id)
    .bind(&intent.id)
    .bind(&customer.id)
    .bind(total_stroops)
    .bind(if use_split { fee_stroops } else { 0 })
    .bind(if use_split {
        merchant_net_stroops
    } else {
        total_stroops
    })
    .execute(&state.db)
    .await?;

    // ── Execute Stellar payment ───────────────────────────────────────────
    //
    // Si el contrato PaymentRouter está configurado, lo usamos para un pago
    // atómico on-chain con split de comisión en una sola tx Soroban.
    // Si no, usamos los pagos clásicos de Stellar (1 o 2 ops).
    let use_contract = state.config.payment_router_contract_id.is_some()
        && state.config.soroban_rpc_url.is_some();

    let tx_result = if use_contract {
        let contract_id = state.config.payment_router_contract_id.as_deref().unwrap();
        let rpc_url     = state.config.soroban_rpc_url.as_deref().unwrap();
        let fee_recv    = platform_g.unwrap_or(merchant.stellar_public_key.as_str());

        tracing::info!(
            intent_id = %intent.id,
            contract_id,
            merchant_stroops = if use_split { merchant_net_stroops } else { total_stroops },
            fee_stroops = if use_split { fee_stroops } else { 0 },
            "Ejecutando pago via contrato Soroban"
        );

        stellar::soroban::execute_contract_payment(stellar::soroban::ContractPayment {
            customer_encrypted_secret: &customer.stellar_secret_encrypted,
            merchant_address: &merchant.stellar_public_key,
            fee_receiver_address: fee_recv,
            merchant_stroops: if use_split { merchant_net_stroops } else { total_stroops },
            fee_stroops: if use_split { fee_stroops } else { 0 },
            contract_id,
            soroban_rpc_url: rpc_url,
            config: &state.config,
        })
        .await
    } else if use_split {
        stellar::execute_split_payment(stellar::SplitPaymentRequest {
            source_encrypted_secret: &customer.stellar_secret_encrypted,
            merchant_destination: &merchant.stellar_public_key,
            merchant_stroops: merchant_net_stroops,
            platform_destination: platform_g.expect("use_split implies Some"),
            platform_stroops: fee_stroops,
            memo: &intent.memo,
            config: &state.config,
        })
        .await
    } else {
        stellar::execute_payment(stellar::StellarPaymentRequest {
            source_encrypted_secret: &customer.stellar_secret_encrypted,
            destination: &merchant.stellar_public_key,
            amount_stroops: total_stroops,
            memo: &intent.memo,
            config: &state.config,
        })
        .await
    };

    match tx_result {
        Ok(tx_hash) => {
            // Mark both records as complete
            sqlx::query(
                "UPDATE payments SET status = 'submitted', stellar_tx_hash = ? WHERE id = ?",
            )
            .bind(&tx_hash)
            .bind(&payment_id)
            .execute(&state.db)
            .await?;

            sqlx::query("UPDATE payment_intents SET status = 'completed' WHERE id = ?")
                .bind(&intent.id)
                .execute(&state.db)
                .await?;

            tracing::info!(
                %payment_id,
                %tx_hash,
                intent_id = %intent.id,
                "Pago Stellar enviado y guardado en DB"
            );

            Ok(Json(SendPaymentResp {
                payment_id,
                stellar_tx_hash: tx_hash,
                amount_mxn: intent.amount_stroops as f64 / 10_000_000.0,
                status: "submitted".into(),
            }))
        }
        Err(e) => {
            sqlx::query("UPDATE payments SET status = 'failed' WHERE id = ?")
                .bind(&payment_id)
                .execute(&state.db)
                .await?;
            tracing::error!(payment_id, error = %e, "stellar payment failed");
            Err(AppError::Stellar(e.to_string()))
        }
    }
}

/// GET /api/payments/history  (user or merchant)
pub async fn payment_history(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<TxHistoryItem>>> {
    tracing::info!(
        user_id = %claims.sub,
        role = ?claims.role,
        "GET /api/payments/history"
    );
    let payments =
        match claims.role {
            Role::User => sqlx::query_as::<_, Payment>(
                "SELECT * FROM payments WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50",
            )
            .bind(&claims.sub)
            .fetch_all(&state.db)
            .await?,
            Role::Merchant => {
                // Join through payment_intents
                sqlx::query_as::<_, Payment>(
                    r#"SELECT p.* FROM payments p
                   JOIN payment_intents pi ON p.payment_intent_id = pi.id
                   WHERE pi.merchant_id = ?
                   ORDER BY p.created_at DESC LIMIT 50"#,
                )
                .bind(&claims.sub)
                .fetch_all(&state.db)
                .await?
            }
        };

    let items: Vec<TxHistoryItem> = payments.iter().map(TxHistoryItem::from).collect();
    tracing::info!(count = items.len(), "Historial devuelto");
    Ok(Json(items))
}

/// GET /api/payments/:id  (auth required, must own the payment)
pub async fn get_payment(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Path(payment_id): Path<String>,
) -> Result<Json<TxHistoryItem>> {
    tracing::info!(%payment_id, user_id = %claims.sub, "GET /api/payments/:id");
    let payment = sqlx::query_as::<_, Payment>("SELECT * FROM payments WHERE id = ?")
        .bind(&payment_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    // Ownership check
    let authorized = match claims.role {
        Role::User => payment.customer_id == claims.sub,
        Role::Merchant => {
            let intent =
                sqlx::query_as::<_, PaymentIntent>("SELECT * FROM payment_intents WHERE id = ?")
                    .bind(&payment.payment_intent_id)
                    .fetch_optional(&state.db)
                    .await?;
            intent.map(|i| i.merchant_id == claims.sub).unwrap_or(false)
        }
    };

    if !authorized {
        tracing::warn!(%payment_id, "Acceso denegado al detalle de pago");
        return Err(AppError::Unauthorized);
    }

    tracing::info!(%payment_id, status = %payment.status, "Detalle de pago OK");
    Ok(Json(TxHistoryItem::from(&payment)))
}
