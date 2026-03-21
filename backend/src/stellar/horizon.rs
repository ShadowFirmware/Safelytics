//! Thin async wrapper around Horizon REST API.

use anyhow::{bail, Context, Result};
use reqwest::{Client, StatusCode};
use serde::Deserialize;

#[derive(Clone)]
pub struct HorizonClient {
    pub base_url: String,
    pub http: Client,
}

// ---------- Horizon response shapes ----------

#[derive(Deserialize, Debug)]
pub struct AccountResponse {
    pub sequence: String,
    pub balances: Vec<Balance>,
}

/// Campos del JSON de Horizon; `asset_type` / otros se deserializan aunque no se lean en Rust aún.
#[allow(dead_code)]
#[derive(Deserialize, Debug)]
pub struct Balance {
    pub balance: String,
    pub asset_type: String,
    #[serde(default)]
    pub asset_code: String,
    #[serde(default)]
    pub asset_issuer: String,
}

#[allow(dead_code)]
#[derive(Deserialize, Debug)]
pub struct SubmitResponse {
    pub hash: Option<String>,
    pub successful: Option<bool>,
    pub extras: Option<serde_json::Value>,
}

// ---------- impl ----------

impl HorizonClient {
    pub fn new(base_url: &str) -> Self {
        Self { base_url: base_url.trim_end_matches('/').to_string(), http: Client::new() }
    }

    /// Carga cuenta en Horizon, o `None` si aún no existe en el ledger (404).
    pub async fn try_load_account(&self, address: &str) -> Result<Option<AccountResponse>> {
        let url = format!("{}/accounts/{}", self.base_url, address);
        let resp = self.http.get(&url).send().await.context("horizon unreachable")?;

        if resp.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            bail!("Horizon load_account {status}: {body}");
        }

        let acc = resp.json::<AccountResponse>().await.context("parse account response")?;
        Ok(Some(acc))
    }

    /// Load account info (sequence number + balances). Error si la cuenta no existe.
    pub async fn load_account(&self, address: &str) -> Result<AccountResponse> {
        self.try_load_account(address)
            .await?
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "Horizon load_account 404: la cuenta {address} no existe en testnet (usa Friendbot primero)"
                )
            })
    }

    /// Submit a signed XDR transaction envelope (base64)
    pub async fn submit_transaction(&self, xdr_b64: &str) -> Result<String> {
        let url = format!("{}/transactions", self.base_url);
        let params = [("tx", xdr_b64)];
        let resp = self.http.post(&url).form(&params).send().await?;

        let status = resp.status();
        let body: SubmitResponse = resp.json().await.context("parse submit response")?;

        if status.is_success() {
            Ok(body.hash.unwrap_or_default())
        } else {
            let detail = body
                .extras
                .as_ref()
                .and_then(|e| e.get("result_codes"))
                .map(|v| v.to_string())
                .unwrap_or_default();
            bail!("Horizon submit {status}: {detail}");
        }
    }

    /// Get MXNe balance for an account (returns 0.0 if no trustline).
    /// Si la cuenta no existe aún en Horizon (404), devuelve 0.0 — típico en testnet antes de Friendbot.
    pub async fn mxne_balance(&self, address: &str, asset_code: &str, issuer: &str) -> Result<f64> {
        let Some(acc) = self.try_load_account(address).await? else {
            tracing::info!(
                %address,
                "Horizon: cuenta aún no en ledger; saldo MXNe mostrado como 0 (funda con Friendbot en testnet si quieres XLM)"
            );
            return Ok(0.0);
        };
        for b in &acc.balances {
            if b.asset_code == asset_code && b.asset_issuer == issuer {
                return Ok(b.balance.parse().unwrap_or(0.0));
            }
        }
        Ok(0.0)
    }

    /// Fund an account with Friendbot (testnet only!)
    pub async fn friendbot(&self, address: &str) -> Result<()> {
        let url = format!("https://friendbot.stellar.org?addr={}", address);
        let resp = self.http.get(&url).send().await?;
        if !resp.status().is_success() {
            bail!("Friendbot failed: {}", resp.status());
        }
        Ok(())
    }
}
