mod auth;
mod config;
mod db;
mod error;
mod models;
mod openpay;
mod routes;
mod stellar;

use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use sqlx::MySqlPool;
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

// ─── Shared application state ────────────────────────────────────────────────

pub struct AppState {
    pub db: MySqlPool,
    pub config: config::Config,
}

// ─── Main ────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Carga backend/.env aunque el cwd no sea la carpeta del proyecto (cmd, IDE, etc.)
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");
    if env_path.is_file() {
        dotenvy::from_path(&env_path)
            .map_err(|e| anyhow::anyhow!("no se pudo leer {:?}: {}", env_path, e))?;
    } else {
        dotenvy::dotenv().ok();
    }

    // Logging — ver también peticiones HTTP (tower_http).
    // Opcional: RUST_LOG=safelytics_backend=debug,tower_http=debug para más detalle.
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            "safelytics_backend=info,tower_http=info,sqlx=warn,hyper=warn".into()
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = config::Config::from_env()?;
    let db = db::connect(&config.database_url).await?;

    let state = Arc::new(AppState { db, config });

    let app = build_router(state);

    let addr = {
        let s = &app; // just to capture state before move
        let _ = s;
        format!(
            "{}:{}",
            std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            std::env::var("PORT").unwrap_or_else(|_| "8080".into()),
        )
    };

    tracing::info!("Safelytics backend listening on {addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

// ─── Router ───────────────────────────────────────────────────────────────────

pub fn build_router(state: Arc<AppState>) -> Router {
    // Public routes (no auth)
    let public = Router::new()
        .route("/api/auth/register", post(routes::auth::register_user))
        .route("/api/auth/login", post(routes::auth::login_user))
        .route("/api/auth/merchant/register", post(routes::auth::register_merchant))
        .route("/api/auth/merchant/login", post(routes::auth::login_merchant))
        // QR info is public so the customer app can display the payment details
        .route("/api/qr/:payment_id", get(routes::qr::get_payment_info))
        .route("/api/qr/:payment_id/quote", get(routes::quote::payment_quote))
        // Webhook OpenPay (público — OpenPay no envía JWT)
        .route("/api/wallet/deposit/webhook", post(routes::deposit::deposit_webhook));

    // Protected routes (require Bearer token)
    let protected = Router::new()
        // QR generation (merchant)
        .route("/api/qr/generate", post(routes::qr::generate_qr))
        // Payments
        .route("/api/payments/send", post(routes::payment::send_payment))
        .route("/api/payments/history", get(routes::payment::payment_history))
        .route("/api/payments/:id", get(routes::payment::get_payment))
        // Merchant dashboard
        .route("/api/merchant/me", get(routes::merchant::merchant_profile))
        .route("/api/merchant/balance", get(routes::merchant::merchant_balance))
        .route("/api/merchant/withdraw", post(routes::merchant::withdraw))
        .route("/api/merchant/withdraw-stellar", post(routes::merchant::withdraw_stellar))
        .route("/api/wallet/balance", get(routes::wallet::wallet_balance))
        .route("/api/wallet/bootstrap-testnet", post(routes::wallet::bootstrap_testnet))
        .route("/api/wallet/faucet-mxne", post(routes::wallet::faucet_mxne))
        // Recargas SPEI (OpenPay)
        .route("/api/wallet/deposit/create", post(routes::deposit::create_deposit))
        .route("/api/wallet/deposit/:id", get(routes::deposit::deposit_status))
        .route("/api/wallet/deposits", get(routes::deposit::list_deposits))
        // Transferencias bancarias salientes
        .route("/api/wallet/transfer/bank", post(routes::transfer::bank_transfer))
        .route("/api/wallet/transfers", get(routes::transfer::list_transfers))
        .layer(middleware::from_fn_with_state(state.clone(), auth::middleware::require_auth));

    Router::new()
        .merge(public)
        .merge(protected)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive()) // tighten in production
        .with_state(state)
}
