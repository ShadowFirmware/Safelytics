use crate::{
    auth::{self, Role},
    error::{AppError, Result},
    stellar, AppState,
};
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

// ─── Request / Response shapes ───────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RegisterUserReq {
    pub phone: String,
    pub name: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct RegisterMerchantReq {
    pub business_name: String,
    pub phone: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginReq {
    pub phone: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub id: String,
    pub public_key: String,
}

// ─── Handlers ────────────────────────────────────────────────────────────────

pub async fn register_user(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RegisterUserReq>,
) -> Result<Json<AuthResponse>> {
    tracing::info!(
        phone = %body.phone,
        name = %body.name,
        "POST /api/auth/register — registro de cliente"
    );
    // Check duplicate phone
    let existing = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE phone = ?")
        .bind(&body.phone)
        .fetch_one(&state.db)
        .await?;
    if existing > 0 {
        return Err(AppError::Conflict("phone already registered".into()));
    }

    let password_hash = bcrypt::hash(&body.password, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("bcrypt: {e}")))?;

    let kp = stellar::generate_keypair();
    let encrypted_secret = stellar::encrypt_secret(&kp.secret_key, &state.config.encryption_key)
        .map_err(|e| AppError::Internal(e))?;

    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO users (id, phone, name, password_hash, stellar_public_key, stellar_secret_encrypted)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.phone)
    .bind(&body.name)
    .bind(&password_hash)
    .bind(&kp.public_key)
    .bind(&encrypted_secret)
    .execute(&state.db)
    .await?;

    let token = auth::create_token(&id, Role::User, &state.config.jwt_secret)?;
    tracing::info!(user_id = %id, "Registro cliente OK, JWT emitido");
    Ok(Json(AuthResponse { token, id, public_key: kp.public_key }))
}

pub async fn login_user(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LoginReq>,
) -> Result<Json<AuthResponse>> {
    tracing::info!(phone = %body.phone, "POST /api/auth/login — cliente");
    let user = sqlx::query_as::<_, crate::models::User>("SELECT * FROM users WHERE phone = ?")
        .bind(&body.phone)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::Unauthorized)?;

    let valid =
        bcrypt::verify(&body.password, &user.password_hash).map_err(|_| AppError::Unauthorized)?;
    if !valid {
        return Err(AppError::Unauthorized);
    }

    let token = auth::create_token(&user.id, Role::User, &state.config.jwt_secret)?;
    tracing::info!(user_id = %user.id, "Login cliente OK");
    Ok(Json(AuthResponse { token, id: user.id, public_key: user.stellar_public_key }))
}

pub async fn register_merchant(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RegisterMerchantReq>,
) -> Result<Json<AuthResponse>> {
    tracing::info!(
        phone = %body.phone,
        business = %body.business_name,
        "POST /api/auth/merchant/register — registro comercio"
    );
    let existing = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM merchants WHERE phone = ?")
        .bind(&body.phone)
        .fetch_one(&state.db)
        .await?;
    if existing > 0 {
        return Err(AppError::Conflict("phone already registered".into()));
    }

    let password_hash = bcrypt::hash(&body.password, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("bcrypt: {e}")))?;

    let kp = stellar::generate_keypair();
    let encrypted_secret = stellar::encrypt_secret(&kp.secret_key, &state.config.encryption_key)
        .map_err(|e| AppError::Internal(e))?;

    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO merchants (id, business_name, phone, password_hash, stellar_public_key, stellar_secret_encrypted)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.business_name)
    .bind(&body.phone)
    .bind(&password_hash)
    .bind(&kp.public_key)
    .bind(&encrypted_secret)
    .execute(&state.db)
    .await?;

    let token = auth::create_token(&id, Role::Merchant, &state.config.jwt_secret)?;
    tracing::info!(merchant_id = %id, "Registro comercio OK, JWT emitido");
    Ok(Json(AuthResponse { token, id, public_key: kp.public_key }))
}

pub async fn login_merchant(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LoginReq>,
) -> Result<Json<AuthResponse>> {
    tracing::info!(phone = %body.phone, "POST /api/auth/merchant/login — comercio");
    let m = sqlx::query_as::<_, crate::models::Merchant>("SELECT * FROM merchants WHERE phone = ?")
        .bind(&body.phone)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::Unauthorized)?;

    let valid =
        bcrypt::verify(&body.password, &m.password_hash).map_err(|_| AppError::Unauthorized)?;
    if !valid {
        return Err(AppError::Unauthorized);
    }

    let token = auth::create_token(&m.id, Role::Merchant, &state.config.jwt_secret)?;
    tracing::info!(merchant_id = %m.id, "Login comercio OK");
    Ok(Json(AuthResponse { token, id: m.id, public_key: m.stellar_public_key }))
}
