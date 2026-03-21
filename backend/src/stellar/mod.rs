pub mod horizon;
pub mod strkey;
pub mod transaction;

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use anyhow::{Context, Result};
use ed25519_dalek::SigningKey;
use rand::RngCore;

use crate::config::Config;
use strkey::{decode_secret, encode_address, encode_secret};

// ---------- Wallet generation ----------

pub struct KeyPair {
    pub public_key: String, // G... address
    pub secret_key: String, // S... seed  (NEVER persisted raw)
}

pub fn generate_keypair() -> KeyPair {
    let mut seed = [0u8; 32];
    OsRng.fill_bytes(&mut seed);
    let signing = SigningKey::from_bytes(&seed);
    KeyPair {
        public_key: encode_address(&signing.verifying_key().to_bytes()),
        secret_key: encode_secret(&seed),
    }
}

// ---------- Key encryption at rest ----------
// AES-256-GCM: iv (12 bytes) || ciphertext || tag (16 bytes) → hex string

pub fn encrypt_secret(secret: &str, key: &[u8; 32]) -> Result<String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut iv = [0u8; 12];
    OsRng.fill_bytes(&mut iv);
    let nonce = Nonce::from_slice(&iv);
    let ciphertext =
        cipher.encrypt(nonce, secret.as_bytes()).map_err(|e| anyhow::anyhow!("encrypt: {e}"))?;
    let mut payload = iv.to_vec();
    payload.extend_from_slice(&ciphertext);
    Ok(hex::encode(payload))
}

pub fn decrypt_secret(encrypted_hex: &str, key: &[u8; 32]) -> Result<String> {
    let payload = hex::decode(encrypted_hex).context("bad hex")?;
    anyhow::ensure!(payload.len() > 12, "encrypted secret too short");
    let (iv, ct) = payload.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let plaintext =
        cipher.decrypt(Nonce::from_slice(iv), ct).map_err(|e| anyhow::anyhow!("decrypt: {e}"))?;
    Ok(String::from_utf8(plaintext).context("secret not utf8")?)
}

// ---------- High-level payment helper ----------

pub struct StellarPaymentRequest<'a> {
    /// Encrypted secret (from DB) of the source wallet
    pub source_encrypted_secret: &'a str,
    pub destination: &'a str,
    pub amount_stroops: i64,
    pub memo: &'a str,
    pub config: &'a Config,
}

pub async fn execute_payment(req: StellarPaymentRequest<'_>) -> Result<String> {
    let horizon = horizon::HorizonClient::new(&req.config.horizon_url);

    // Decrypt source key
    let secret_str = decrypt_secret(req.source_encrypted_secret, &req.config.encryption_key)?;
    let seed = decode_secret(&secret_str)?;
    let signing = SigningKey::from_bytes(&seed);
    let source_address = encode_address(&signing.verifying_key().to_bytes());

    // Load sequence
    let account = horizon.load_account(&source_address).await?;
    let sequence: i64 = account.sequence.parse().context("parse sequence")?;

    // Build + sign + submit
    let xdr = transaction::build_and_sign(transaction::PaymentParams {
        source_seed: seed,
        destination: req.destination,
        asset_code: req
            .config
            .mxne_asset_code
            .as_bytes()
            .try_into()
            .map_err(|_| anyhow::anyhow!("asset code must be 4 chars"))?,
        asset_issuer: &req.config.mxne_issuer,
        amount_stroops: req.amount_stroops,
        memo: req.memo,
        sequence,
        fee: 100,
        network_hash: req.config.network_hash(),
    })?;

    let tx_hash = horizon.submit_transaction(&xdr).await?;
    Ok(tx_hash)
}

pub struct SplitPaymentRequest<'a> {
    pub source_encrypted_secret: &'a str,
    pub merchant_destination: &'a str,
    pub merchant_stroops: i64,
    pub platform_destination: &'a str,
    pub platform_stroops: i64,
    pub memo: &'a str,
    pub config: &'a Config,
}

/// Un solo envío Stellar: pago al comercio (neto) + comisión a la wallet de plataforma.
pub async fn execute_split_payment(req: SplitPaymentRequest<'_>) -> Result<String> {
    let horizon = horizon::HorizonClient::new(&req.config.horizon_url);

    let secret_str = decrypt_secret(req.source_encrypted_secret, &req.config.encryption_key)?;
    let seed = decode_secret(&secret_str)?;
    let signing = SigningKey::from_bytes(&seed);
    let source_address = encode_address(&signing.verifying_key().to_bytes());

    let account = horizon.load_account(&source_address).await?;
    let sequence: i64 = account.sequence.parse().context("parse sequence")?;

    let asset_bytes: [u8; 4] = req
        .config
        .mxne_asset_code
        .as_bytes()
        .try_into()
        .map_err(|_| anyhow::anyhow!("MXNE_ASSET_CODE debe tener exactamente 4 caracteres"))?;

    let xdr = transaction::build_two_payments_and_sign(transaction::SplitPaymentParams {
        source_seed: seed,
        asset_code: asset_bytes,
        asset_issuer: &req.config.mxne_issuer,
        merchant_destination: req.merchant_destination,
        merchant_stroops: req.merchant_stroops,
        platform_destination: req.platform_destination,
        platform_stroops: req.platform_stroops,
        memo: req.memo,
        sequence,
        fee_per_operation: 100,
        network_hash: req.config.network_hash(),
    })?;

    horizon.submit_transaction(&xdr).await
}

/// Abre trustline MXNe firmada por la wallet del usuario/comercio (después de Friendbot).
pub async fn execute_change_trust(
    source_encrypted_secret: &str,
    config: &Config,
) -> Result<String> {
    let horizon = horizon::HorizonClient::new(&config.horizon_url);

    let secret_str = decrypt_secret(source_encrypted_secret, &config.encryption_key)?;
    let seed = decode_secret(&secret_str)?;
    let signing = SigningKey::from_bytes(&seed);
    let source_address = encode_address(&signing.verifying_key().to_bytes());

    let account = horizon.load_account(&source_address).await?;
    let sequence: i64 = account.sequence.parse().context("parse sequence")?;

    let asset_bytes: [u8; 4] = config
        .mxne_asset_code
        .as_bytes()
        .try_into()
        .map_err(|_| anyhow::anyhow!("MXNE_ASSET_CODE debe tener exactamente 4 caracteres"))?;

    let xdr = transaction::build_change_trust_and_sign(transaction::ChangeTrustParams {
        source_seed: seed,
        asset_code: asset_bytes,
        asset_issuer: &config.mxne_issuer,
        limit: i64::MAX,
        sequence,
        fee: 100,
        network_hash: config.network_hash(),
    })?;

    horizon.submit_transaction(&xdr).await
}

/// Pago MXNe desde la cuenta **emisor** (faucet). `issuer_secret` es S...
pub async fn execute_issuer_to_destination(
    issuer_secret: &str,
    destination_g: &str,
    amount_stroops: i64,
    memo: &str,
    config: &Config,
) -> Result<String> {
    anyhow::ensure!(amount_stroops > 0, "amount must be positive");

    let horizon = horizon::HorizonClient::new(&config.horizon_url);
    let seed = decode_secret(issuer_secret)?;
    let signing = SigningKey::from_bytes(&seed);
    let source_address = encode_address(&signing.verifying_key().to_bytes());
    anyhow::ensure!(
        source_address == config.mxne_issuer,
        "MXNE_ISSUER_SECRET no coincide con MXNE_ISSUER"
    );

    let account = horizon.load_account(&source_address).await?;
    let sequence: i64 = account.sequence.parse().context("parse sequence")?;

    let asset_bytes: [u8; 4] = config
        .mxne_asset_code
        .as_bytes()
        .try_into()
        .map_err(|_| anyhow::anyhow!("MXNE_ASSET_CODE debe tener exactamente 4 caracteres"))?;

    let xdr = transaction::build_and_sign(transaction::PaymentParams {
        source_seed: seed,
        destination: destination_g,
        asset_code: asset_bytes,
        asset_issuer: &config.mxne_issuer,
        amount_stroops,
        memo,
        sequence,
        fee: 100,
        network_hash: config.network_hash(),
    })?;

    horizon.submit_transaction(&xdr).await
}
