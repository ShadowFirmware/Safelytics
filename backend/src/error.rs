use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Not found")]
    NotFound,

    #[error("Unauthorized")]
    Unauthorized,

    #[error("{0}")]
    BadRequest(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Stellar error: {0}")]
    Stellar(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Internal error")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::NotFound => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, m.clone()),
            AppError::Conflict(m) => (StatusCode::CONFLICT, m.clone()),
            AppError::Stellar(m) => {
                tracing::warn!(
                    status = StatusCode::BAD_GATEWAY.as_u16(),
                    error = %m,
                    "Fallo Stellar / proveedor externo"
                );
                (StatusCode::BAD_GATEWAY, m.clone())
            }
            AppError::Database(e) => {
                tracing::error!(error = %e, "Error de base de datos");
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error".into())
            }
            AppError::Internal(e) => {
                tracing::error!(error = %e, "Error interno");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal error".into())
            }
        };

        if status.is_client_error() {
            tracing::warn!(
                status = status.as_u16(),
                error = %message,
                "Respuesta de error al cliente (4xx)"
            );
        }

        (status, Json(json!({ "error": message }))).into_response()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
