//! Cartera: saldo MXNe, bootstrap testnet (Friendbot + trustline) y faucet desde emisor.

use crate::{
    auth::{Claims, Role},
    config::StellarNetwork,
    error::{AppError, Result},
    models::{BalanceResponse, Merchant, User},
    stellar::{self, horizon::HorizonClient},
    AppState,
};
use axum::{
    extract::{Extension, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

fn require_testnet(state: &AppState) -> Result<()> {
    if state.config.stellar_network != StellarNetwork::Testnet {
        return Err(AppError::BadRequest("Recarga / faucet solo en Stellar testnet".into()));
    }
    Ok(())
}

struct WalletSecrets {
    public_key: String,
    stellar_secret_encrypted: String,
}

async fn load_wallet(state: &AppState, claims: &Claims) -> Result<WalletSecrets> {
    match claims.role {
        Role::User => {
            let u = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = ?")
                .bind(&claims.sub)
                .fetch_one(&state.db)
                .await?;
            Ok(WalletSecrets {
                public_key: u.stellar_public_key,
                stellar_secret_encrypted: u.stellar_secret_encrypted,
            })
        }
        Role::Merchant => {
            let m = sqlx::query_as::<_, Merchant>("SELECT * FROM merchants WHERE id = ?")
                .bind(&claims.sub)
                .fetch_one(&state.db)
                .await?;
            Ok(WalletSecrets {
                public_key: m.stellar_public_key,
                stellar_secret_encrypted: m.stellar_secret_encrypted,
            })
        }
    }
}

/// GET /api/wallet/balance — MXNe en Horizon (cliente o comercio).
pub async fn wallet_balance(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<BalanceResponse>> {
    let w = load_wallet(&state, &claims).await?;
    let horizon = HorizonClient::new(&state.config.horizon_url);
    let balance = horizon
        .mxne_balance(&w.public_key, &state.config.mxne_asset_code, &state.config.mxne_issuer)
        .await
        .map_err(|e| AppError::Stellar(e.to_string()))?;

    Ok(Json(BalanceResponse { public_key: w.public_key, mxne_balance: balance }))
}

#[derive(Serialize)]
pub struct BootstrapTestnetResp {
    pub public_key: String,
    pub friendbot_attempted: bool,
    pub friendbot_error: Option<String>,
    pub change_trust_tx_hash: String,
    pub message: String,
}

/// POST /api/wallet/bootstrap-testnet — Friendbot (XLM) + trustline MXNe.
pub async fn bootstrap_testnet(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<BootstrapTestnetResp>> {
    require_testnet(&state)?;
    let w = load_wallet(&state, &claims).await?;
    let horizon = HorizonClient::new(&state.config.horizon_url);

    let friendbot_attempted = true;
    let mut friendbot_error: Option<String> = None;

    match horizon.friendbot(&w.public_key).await {
        Ok(()) => {}
        Err(e) => {
            friendbot_error = Some(e.to_string());
            tracing::warn!(
                pk = %w.public_key,
                error = %e,
                "Friendbot falló (a veces la cuenta ya existe)"
            );
        }
    }

    if horizon.try_load_account(&w.public_key).await?.is_none() {
        return Err(AppError::BadRequest(
            "La cuenta no existe en testnet. Reintenta o abre Friendbot manualmente en el navegador."
                .into(),
        ));
    }

    let tx_hash = stellar::execute_change_trust(&w.stellar_secret_encrypted, &state.config)
        .await
        .map_err(|e| AppError::Stellar(e.to_string()))?;

    tracing::info!(
        user_id = %claims.sub,
        role = ?claims.role,
        %tx_hash,
        "Bootstrap testnet: trustline MXNe creada/actualizada"
    );

    Ok(Json(BootstrapTestnetResp {
        public_key: w.public_key,
        friendbot_attempted,
        friendbot_error,
        change_trust_tx_hash: tx_hash,
        message: "Listo: tienes XLM de prueba (si Friendbot OK) y trustline MXNe. Usa «Recibir MXNe» para fondos de prueba.".into(),
    }))
}

#[derive(Deserialize)]
pub struct FaucetMxneReq {
    /// Cantidad en MXN “token” (testnet), máx. 1_000_000 por petición.
    pub amount_mxn: f64,
}

#[derive(Serialize)]
pub struct FaucetMxneResp {
    pub stellar_tx_hash: String,
    pub amount_mxn: f64,
}

/// POST /api/wallet/faucet-mxne — emisor envía MXNe a tu wallet (requiere `MXNE_ISSUER_SECRET`).
pub async fn faucet_mxne(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<FaucetMxneReq>,
) -> Result<Json<FaucetMxneResp>> {
    require_testnet(&state)?;

    let issuer_secret = state
        .config
        .mxne_issuer_secret
        .as_deref()
        .ok_or_else(|| {
            AppError::BadRequest(
                "Faucet desactivado: define MXNE_ISSUER_SECRET en el servidor (secreto S del emisor MXNe)."
                    .into(),
            )
        })?;

    if body.amount_mxn <= 0.0 {
        return Err(AppError::BadRequest("amount_mxn debe ser > 0".into()));
    }
    if body.amount_mxn > 1_000_000.0 {
        return Err(AppError::BadRequest("amount_mxn demasiado alto (máx. 1_000_000)".into()));
    }

    let w = load_wallet(&state, &claims).await?;
    let stroops = (body.amount_mxn * 10_000_000.0).round() as i64;

    let tx_hash = stellar::execute_issuer_to_destination(
        issuer_secret,
        &w.public_key,
        stroops,
        "FAUCET",
        &state.config,
    )
    .await
    .map_err(|e| AppError::Stellar(e.to_string()))?;

    tracing::info!(
        user_id = %claims.sub,
        amount_mxn = body.amount_mxn,
        %tx_hash,
        "Faucet MXNe enviado"
    );

    Ok(Json(FaucetMxneResp { stellar_tx_hash: tx_hash, amount_mxn: body.amount_mxn }))
}
