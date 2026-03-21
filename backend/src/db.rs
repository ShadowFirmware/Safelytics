use anyhow::Result;
use sqlx::{mysql::MySqlPoolOptions, MySqlPool};

pub async fn connect(database_url: &str) -> Result<MySqlPool> {
    tracing::info!("Conectando a MySQL…");
    let pool = MySqlPoolOptions::new().max_connections(10).connect(database_url).await?;

    tracing::info!("Ejecutando migraciones SQLx…");
    sqlx::migrate!("./migrations").run(&pool).await?;
    tracing::info!("MySQL listo (pool + migraciones OK)");

    Ok(pool)
}
