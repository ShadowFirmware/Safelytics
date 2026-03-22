//! Soroban smart contract integration.
//!
//! Flow para un pago por contrato:
//!  1. Descifrar la clave del cliente.
//!  2. Cargar secuencia desde Horizon.
//!  3. Calcular la dirección SAC de MXNe (determinista: hash del asset + issuer + red).
//!  4. Construir `InvokeHostFunctionOp` con auth vacía.
//!  5. Simular via Soroban RPC → obtener `SorobanTransactionData` + auth entries + min_resource_fee.
//!  6. Reconstruir la tx con footprint, auth y fee final.
//!  7. Firmar y enviar via Horizon → devolver tx hash.

use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ed25519_dalek::Signer;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use stellar_xdr::curr::{
    AccountId, AlphaNum4, Asset, AssetCode4, BytesM, ContractId, ContractIdPreimage,
    DecoratedSignature, Hash, HashIdPreimage, HashIdPreimageContractId, HostFunction,
    Int128Parts, InvokeContractArgs, InvokeHostFunctionOp, Limits, Memo, MuxedAccount,
    Operation, OperationBody, Preconditions, PublicKey, ReadXdr, ScAddress, ScSymbol, ScVal,
    SequenceNumber, Signature, SignatureHint, SorobanAuthorizationEntry, SorobanTransactionData,
    Transaction, TransactionEnvelope, TransactionExt, TransactionSignaturePayload,
    TransactionSignaturePayloadTaggedTransaction, TransactionV1Envelope, Uint256, VecM, WriteXdr,
};

use crate::config::Config;
use super::{decrypt_secret, horizon, strkey};

// ── Soroban RPC types ─────────────────────────────────────────────────────────

#[derive(Serialize)]
struct RpcReq<T: Serialize> {
    jsonrpc: &'static str,
    id: u64,
    method: &'static str,
    params: T,
}

#[derive(Deserialize, Debug)]
struct RpcResp<T> {
    result: Option<T>,
    error: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct SimParams {
    transaction: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SimResult {
    results: Option<Vec<SimEntry>>,
    transaction_data: Option<String>,
    min_resource_fee: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize, Debug)]
struct SimEntry {
    auth: Option<Vec<String>>,
}

// ── SAC address computation ───────────────────────────────────────────────────
//
// El contrato SAC de un asset clásico tiene una dirección determinista:
//   contract_id = SHA-256( HashIdPreimage::ContractId { network_id, FromAsset(asset) } )

fn compute_sac_hash(
    asset_code: [u8; 4],
    issuer: [u8; 32],
    network_hash: [u8; 32],
) -> Result<ContractId> {
    let preimage = HashIdPreimage::ContractId(HashIdPreimageContractId {
        network_id: Hash(network_hash),
        contract_id_preimage: ContractIdPreimage::Asset(Asset::CreditAlphanum4(AlphaNum4 {
            asset_code: AssetCode4(asset_code),
            issuer: AccountId(PublicKey::PublicKeyTypeEd25519(Uint256(issuer))),
        })),
    });
    let bytes = preimage.to_xdr(Limits::none()).context("serialize SAC preimage")?;
    let hash: [u8; 32] = Sha256::digest(&bytes).into();
    Ok(ContractId(Hash(hash)))
}

// ── ScVal helpers ─────────────────────────────────────────────────────────────

fn i128_scval(v: i128) -> ScVal {
    ScVal::I128(Int128Parts { hi: (v >> 64) as i64, lo: v as u64 })
}

fn account_scval(bytes: [u8; 32]) -> ScVal {
    ScVal::Address(ScAddress::Account(AccountId(
        PublicKey::PublicKeyTypeEd25519(Uint256(bytes)),
    )))
}

// ── Public API ────────────────────────────────────────────────────────────────

pub struct ContractPayment<'a> {
    pub customer_encrypted_secret: &'a str,
    pub merchant_address: &'a str,
    /// Wallet que recibe la comisión de plataforma (puede ser igual al comercio si fee = 0).
    pub fee_receiver_address: &'a str,
    /// Monto neto al comercio en stroops.
    pub merchant_stroops: i64,
    /// Comisión de plataforma en stroops (0 = sin split).
    pub fee_stroops: i64,
    /// Dirección C... del contrato PaymentRouter desplegado en testnet.
    pub contract_id: &'a str,
    pub soroban_rpc_url: &'a str,
    pub config: &'a Config,
}

pub async fn execute_contract_payment(p: ContractPayment<'_>) -> Result<String> {
    // ── 1. Descifrar clave del cliente ────────────────────────────────────
    let secret_str = decrypt_secret(p.customer_encrypted_secret, &p.config.encryption_key)?;
    let seed = strkey::decode_secret(&secret_str)?;
    let signing = ed25519_dalek::SigningKey::from_bytes(&seed);
    let source_pk = signing.verifying_key().to_bytes();
    let source_g = strkey::encode_address(&source_pk);

    // ── 2. Cargar secuencia desde Horizon ─────────────────────────────────
    let horizon = horizon::HorizonClient::new(&p.config.horizon_url);
    let account = horizon.load_account(&source_g).await?;
    let seq: i64 = account.sequence.parse().context("parse sequence")?;

    // ── 3. Calcular dirección SAC del token MXNe ─────────────────────────
    let issuer_bytes = strkey::decode_address(&p.config.mxne_issuer)?;
    let asset_code: [u8; 4] = p
        .config
        .mxne_asset_code
        .as_bytes()
        .try_into()
        .map_err(|_| anyhow::anyhow!("MXNE_ASSET_CODE debe ser 4 caracteres"))?;
    let token_hash = compute_sac_hash(asset_code, issuer_bytes, p.config.network_hash())?;

    // ── 4. Decodificar dirección del contrato (C... → [u8;32]) ────────────
    let contract_bytes = strkey::decode_contract_address(p.contract_id)?;
    let contract_hash = ContractId(Hash(contract_bytes));

    // ── 5. Construir argumentos ScVal ─────────────────────────────────────
    let merchant_bytes = strkey::decode_address(p.merchant_address)?;
    let fee_bytes = strkey::decode_address(p.fee_receiver_address)?;

    let fn_sym = ScSymbol(
        b"pay".to_vec().try_into().map_err(|_| anyhow::anyhow!("symbol too long"))?,
    );

    let invoke_args = InvokeContractArgs {
        contract_address: ScAddress::Contract(contract_hash),
        function_name: fn_sym,
        args: vec![
            ScVal::Address(ScAddress::Contract(token_hash)),
            account_scval(source_pk),
            account_scval(merchant_bytes),
            account_scval(fee_bytes),
            i128_scval(p.merchant_stroops as i128),
            i128_scval(p.fee_stroops as i128),
        ]
        .try_into()
        .map_err(|e| anyhow::anyhow!("args VecM: {e}"))?,
    };

    // ── 6. Construir tx stub (sin footprint) para simulación ─────────────
    let stub_tx = Transaction {
        source_account: MuxedAccount::Ed25519(Uint256(source_pk)),
        fee: 100,
        seq_num: SequenceNumber(seq + 1),
        cond: Preconditions::None,
        memo: Memo::None,
        operations: vec![Operation {
            source_account: None,
            body: OperationBody::InvokeHostFunction(InvokeHostFunctionOp {
                host_function: HostFunction::InvokeContract(invoke_args.clone()),
                auth: VecM::default(),
            }),
        }]
        .try_into()
        .map_err(|_| anyhow::anyhow!("stub ops"))?,
        ext: TransactionExt::V0,
    };

    let stub_b64 = B64.encode(
        TransactionEnvelope::Tx(TransactionV1Envelope {
            tx: stub_tx,
            signatures: VecM::default(),
        })
        .to_xdr(Limits::none())
        .context("serialize stub")?,
    );

    // ── 7. Simular via Soroban RPC ────────────────────────────────────────
    let client = reqwest::Client::new();
    let sim_resp: RpcResp<SimResult> = client
        .post(p.soroban_rpc_url)
        .json(&RpcReq {
            jsonrpc: "2.0",
            id: 1,
            method: "simulateTransaction",
            params: SimParams { transaction: stub_b64 },
        })
        .send()
        .await
        .context("soroban RPC request")?
        .json()
        .await
        .context("parse simulate response")?;

    if let Some(err) = &sim_resp.error {
        anyhow::bail!("soroban RPC error: {err}");
    }
    let sim = sim_resp.result.ok_or_else(|| anyhow::anyhow!("simulate: sin result"))?;
    if let Some(err) = &sim.error {
        anyhow::bail!("simulate error: {err}");
    }

    let tx_data_b64 = sim
        .transaction_data
        .ok_or_else(|| anyhow::anyhow!("simulate: sin transactionData"))?;
    let min_fee: u32 =
        sim.min_resource_fee.as_deref().unwrap_or("0").parse().unwrap_or(0);

    // ── 8. Decodificar SorobanTransactionData (footprint) ────────────────
    let tx_data_bytes = B64.decode(&tx_data_b64).context("decode transactionData")?;
    let soroban_data = SorobanTransactionData::from_xdr(&tx_data_bytes, Limits::none())
        .context("parse SorobanTransactionData")?;

    // ── 9. Decodificar auth entries de la simulación ──────────────────────
    let sim_auth_b64: Vec<String> = sim
        .results
        .and_then(|r| r.into_iter().next())
        .and_then(|e| e.auth)
        .unwrap_or_default();

    let auth_entries: Vec<SorobanAuthorizationEntry> = sim_auth_b64
        .iter()
        .map(|b64| {
            let bytes = B64.decode(b64).context("decode auth entry")?;
            SorobanAuthorizationEntry::from_xdr(&bytes, Limits::none())
                .context("parse SorobanAuthorizationEntry")
        })
        .collect::<Result<Vec<_>>>()?;

    let auth: VecM<SorobanAuthorizationEntry> =
        auth_entries.try_into().map_err(|e| anyhow::anyhow!("auth VecM: {e}"))?;

    // ── 10. Construir tx final con footprint + auth + fee ─────────────────
    // El fee total = base + resource fee de simulación + margen de seguridad.
    let total_fee: u32 = 100u32.saturating_add(min_fee).saturating_add(100_000);

    let final_tx = Transaction {
        source_account: MuxedAccount::Ed25519(Uint256(source_pk)),
        fee: total_fee,
        seq_num: SequenceNumber(seq + 1),
        cond: Preconditions::None,
        memo: Memo::None,
        operations: vec![Operation {
            source_account: None,
            body: OperationBody::InvokeHostFunction(InvokeHostFunctionOp {
                host_function: HostFunction::InvokeContract(invoke_args),
                auth,
            }),
        }]
        .try_into()
        .map_err(|_| anyhow::anyhow!("final ops"))?,
        ext: TransactionExt::V1(soroban_data),
    };

    // ── 11. Firmar ────────────────────────────────────────────────────────
    let payload = TransactionSignaturePayload {
        network_id: Hash(p.config.network_hash()),
        tagged_transaction: TransactionSignaturePayloadTaggedTransaction::Tx(final_tx.clone()),
    };
    let payload_xdr = payload.to_xdr(Limits::none()).context("serialize payload")?;
    let hash_bytes: [u8; 32] = Sha256::digest(&payload_xdr).into();

    let ed_sig = signing.sign(&hash_bytes);
    let hint = SignatureHint(source_pk[28..32].try_into().unwrap());
    let sig_bytes: BytesM<64> = ed_sig
        .to_bytes()
        .to_vec()
        .try_into()
        .map_err(|_| anyhow::anyhow!("signature overflow"))?;

    let envelope = TransactionEnvelope::Tx(TransactionV1Envelope {
        tx: final_tx,
        signatures: vec![DecoratedSignature { hint, signature: Signature(sig_bytes) }]
            .try_into()
            .map_err(|_| anyhow::anyhow!("signatures overflow"))?,
    });

    // ── 12. Enviar via Horizon ────────────────────────────────────────────
    let xdr_b64 = B64.encode(envelope.to_xdr(Limits::none()).context("serialize envelope")?);
    let tx_hash = horizon.submit_transaction(&xdr_b64).await?;
    Ok(tx_hash)
}
