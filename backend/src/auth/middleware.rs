use crate::{auth, error::AppError, AppState};
use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

/// Validates Bearer token and injects `Claims` into request extensions.
pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let path = req.uri().path().to_string();

    let token = req
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .ok_or_else(|| {
            tracing::warn!(%path, "Auth: falta header Authorization Bearer");
            AppError::Unauthorized
        })?;

    let claims = auth::verify_token(token, &state.config.jwt_secret).map_err(|e| {
        tracing::warn!(%path, error = %e, "Auth: token inválido o expirado");
        e
    })?;

    tracing::info!(
        %path,
        user_id = %claims.sub,
        role = ?claims.role,
        "Auth: token OK, sigue el handler"
    );

    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}
