//! Cliente HTTP para la API de OpenPay (BBVA).
//! Documentación: https://www.openpay.mx/docs/api/

use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use serde::{Deserialize, Serialize};

pub struct OpenPayClient {
    client: Client,
    base_url: String,
    auth_header: String,
}

// ─── Respuestas de OpenPay ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SpeiCharge {
    pub id: String,
    pub amount: f64,
    pub status: String,
    pub order_id: Option<String>,
    pub operation_type: Option<String>,
    pub payment_method: Option<SpeiPaymentMethod>,
}

#[derive(Debug, Deserialize)]
pub struct SpeiPaymentMethod {
    #[serde(rename = "type")]
    pub method_type: String,
    pub clabe: Option<String>,
    pub bank: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OpenPayPayout {
    pub id: String,
    pub amount: f64,
    pub status: String,
}

#[derive(Debug, Deserialize)]
struct OpenPayErrorResp {
    #[serde(default)]
    description: String,
    #[serde(default)]
    error_code: i64,
}

// ─── Implementación ───────────────────────────────────────────────────────────

impl OpenPayClient {
    pub fn new(merchant_id: &str, private_key: &str, sandbox: bool) -> Self {
        let base_url = if sandbox {
            format!("https://sandbox-api.openpay.mx/v1/{}", merchant_id)
        } else {
            format!("https://api.openpay.mx/v1/{}", merchant_id)
        };
        // Basic auth: private_key como usuario, contraseña vacía
        let credentials = STANDARD.encode(format!("{}:", private_key));
        Self {
            client: Client::new(),
            base_url,
            auth_header: format!("Basic {}", credentials),
        }
    }

    /// Crea un cargo SPEI (entrante). Devuelve la CLABE a la que el usuario debe transferir.
    pub async fn create_spei_charge(
        &self,
        order_id: &str,
        amount_mxn: f64,
        description: &str,
        customer_name: &str,
        customer_phone: &str,
    ) -> anyhow::Result<SpeiCharge> {
        // OpenPay requiere email válido aunque sea ficticio
        let fake_email = format!(
            "{}@safelytics.app",
            order_id.split('-').next().unwrap_or("user")
        );

        let body = serde_json::json!({
            "method": "bank_account",
            "amount": amount_mxn,
            "description": description,
            "order_id": order_id,
            "customer": {
                "name": customer_name,
                "last_name": "Safelytics",
                "email": fake_email,
                "phone_number": customer_phone
            }
        });

        let res = self
            .client
            .post(format!("{}/charges", self.base_url))
            .header("Authorization", &self.auth_header)
            .json(&body)
            .send()
            .await?;

        if !res.status().is_success() {
            let err: OpenPayErrorResp = res.json().await.unwrap_or(OpenPayErrorResp {
                description: "Error desconocido".into(),
                error_code: 0,
            });
            anyhow::bail!("OpenPay [{}]: {}", err.error_code, err.description);
        }

        Ok(res.json::<SpeiCharge>().await?)
    }

    /// Crea un payout SPEI (saliente) a la CLABE del destinatario.
    pub async fn create_payout(
        &self,
        order_id: &str,
        amount_mxn: f64,
        description: &str,
        clabe: &str,
        holder_name: &str,
    ) -> anyhow::Result<OpenPayPayout> {
        let body = serde_json::json!({
            "method": "bank_account",
            "bank_account": {
                "clabe": clabe,
                "alias": "Destino",
                "holder_name": holder_name
            },
            "amount": amount_mxn,
            "description": description,
            "order_id": order_id
        });

        let res = self
            .client
            .post(format!("{}/payouts", self.base_url))
            .header("Authorization", &self.auth_header)
            .json(&body)
            .send()
            .await?;

        if !res.status().is_success() {
            let err: OpenPayErrorResp = res.json().await.unwrap_or(OpenPayErrorResp {
                description: "Error desconocido".into(),
                error_code: 0,
            });
            anyhow::bail!("OpenPay [{}]: {}", err.error_code, err.description);
        }

        Ok(res.json::<OpenPayPayout>().await?)
    }

    /// Consulta el estado de un cargo por su ID de OpenPay.
    pub async fn get_charge(&self, charge_id: &str) -> anyhow::Result<SpeiCharge> {
        let res = self
            .client
            .get(format!("{}/charges/{}", self.base_url, charge_id))
            .header("Authorization", &self.auth_header)
            .send()
            .await?;

        if !res.status().is_success() {
            let err: OpenPayErrorResp = res.json().await.unwrap_or(OpenPayErrorResp {
                description: "Error desconocido".into(),
                error_code: 0,
            });
            anyhow::bail!("OpenPay [{}]: {}", err.error_code, err.description);
        }

        Ok(res.json::<SpeiCharge>().await?)
    }
}
