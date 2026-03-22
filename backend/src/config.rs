use anyhow::{Context, Result};

#[derive(Clone, Debug)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub jwt_secret: String,
    pub stellar_network: StellarNetwork,
    pub horizon_url: String,
    pub network_passphrase: String,
    pub mxne_asset_code: String,
    pub mxne_issuer: String,
    /// Secreto S... del emisor MXNe (solo testnet / faucet). Vacío = faucet desactivado.
    pub mxne_issuer_secret: Option<String>,
    /// 32-byte key for AES-256-GCM (stored as hex in env)
    pub encryption_key: [u8; 32],
    /// Platform fee in basis points (1 bps = 0.01%). Ej. 50 = 0.5% descontado del comercio en el modelo de cotización.
    pub fee_bps: u64,
    /// MXN por 1 USDC (referencia para mostrar equivalente; no es precio de path payment on-chain aún).
    pub reference_mxn_per_usdc: f64,
    /// Cuenta Stellar `G...` que recibe la comisión en MXNe (split on-chain). Si vacío, no hay split (todo al comercio).
    pub platform_fee_receiver: Option<String>,
    // ── OpenPay (BBVA) ────────────────────────────────────────────────────────
    /// ID de comercio en OpenPay (panel.openpay.mx).
    pub openpay_merchant_id: Option<String>,
    /// Llave privada de OpenPay (sk_...).
    pub openpay_private_key: Option<String>,
    /// true = sandbox (pruebas), false = producción.
    pub openpay_sandbox: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub enum StellarNetwork {
    Testnet,
    Mainnet,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let encryption_hex = std::env::var("KEY_ENCRYPTION_SECRET").context(
            "KEY_ENCRYPTION_SECRET no definida. Añádela en backend/.env (64 caracteres hex = 32 bytes). Ej.: openssl rand -hex 32",
        )?;
        let encryption_hex = encryption_hex.trim();
        if encryption_hex.is_empty() {
            anyhow::bail!(
                "KEY_ENCRYPTION_SECRET está vacía. Genera una clave de 32 bytes en hex (openssl rand -hex 32) y pégala en backend/.env"
            );
        }
        let encryption_bytes = hex::decode(encryption_hex)
            .context("KEY_ENCRYPTION_SECRET debe ser 64 caracteres hexadecimales (32 bytes)")?;
        anyhow::ensure!(encryption_bytes.len() == 32, "KEY_ENCRYPTION_SECRET must be 32 bytes");
        let mut encryption_key = [0u8; 32];
        encryption_key.copy_from_slice(&encryption_bytes);

        let network_str = std::env::var("STELLAR_NETWORK").unwrap_or_else(|_| "testnet".into());
        let stellar_network = match network_str.to_lowercase().as_str() {
            "mainnet" => StellarNetwork::Mainnet,
            _ => StellarNetwork::Testnet,
        };

        Ok(Config {
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: std::env::var("PORT").unwrap_or_else(|_| "8080".into()).parse()?,
            database_url: std::env::var("DATABASE_URL").context("DATABASE_URL missing")?,
            jwt_secret: std::env::var("JWT_SECRET").context("JWT_SECRET missing")?,
            horizon_url: std::env::var("STELLAR_HORIZON_URL")
                .unwrap_or_else(|_| "https://horizon-testnet.stellar.org".into()),
            network_passphrase: std::env::var("STELLAR_NETWORK_PASSPHRASE")
                .unwrap_or_else(|_| "Test SDF Network ; September 2015".into()),
            mxne_asset_code: std::env::var("MXNE_ASSET_CODE").unwrap_or_else(|_| "MXNe".into()),
            mxne_issuer: std::env::var("MXNE_ISSUER").context("MXNE_ISSUER missing")?,
            mxne_issuer_secret: std::env::var("MXNE_ISSUER_SECRET").ok().filter(|s| !s.is_empty()),
            fee_bps: std::env::var("PLATFORM_FEE_BPS").unwrap_or_else(|_| "50".into()).parse()?,
            reference_mxn_per_usdc: {
                let r: f64 = std::env::var("REFERENCE_MXN_PER_USDC")
                    .unwrap_or_else(|_| "17.5".into())
                    .parse()
                    .unwrap_or(17.5_f64);
                r.max(0.01_f64)
            },
            platform_fee_receiver: std::env::var("PLATFORM_FEE_RECEIVER")
                .ok()
                .filter(|s| !s.is_empty()),
            openpay_merchant_id: std::env::var("OPENPAY_MERCHANT_ID")
                .ok()
                .filter(|s| !s.is_empty()),
            openpay_private_key: std::env::var("OPENPAY_PRIVATE_KEY")
                .ok()
                .filter(|s| !s.is_empty()),
            openpay_sandbox: std::env::var("OPENPAY_SANDBOX")
                .unwrap_or_else(|_| "true".into())
                .to_lowercase()
                != "false",
            stellar_network,
            encryption_key,
        })
    }

    /// Network passphrase SHA-256 hash (used for transaction signing)
    pub fn network_hash(&self) -> [u8; 32] {
        use sha2::{Digest, Sha256};
        Sha256::digest(self.network_passphrase.as_bytes()).into()
    }
}
