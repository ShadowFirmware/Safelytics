//! Stellar transaction construction + signing using stellar-xdr.
//!
//! Flow:
//!   1. Load source account sequence from Horizon.
//!   2. Build Transaction XDR with a single PaymentOp.
//!   3. Hash the TransactionSignaturePayload.
//!   4. Sign with ed25519-dalek.
//!   5. Return base64-encoded TransactionEnvelope for submission.

use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ed25519_dalek::Signer;
use sha2::{Digest, Sha256};
use stellar_xdr::curr::{
    AccountId, AlphaNum4, Asset, AssetCode4, BytesM, ChangeTrustAsset, ChangeTrustOp,
    DecoratedSignature, Hash, Limits, Memo, MuxedAccount, Operation, OperationBody, PaymentOp,
    Preconditions, PublicKey, SequenceNumber, Signature, SignatureHint, StringM, Transaction,
    TransactionEnvelope, TransactionExt, TransactionSignaturePayload,
    TransactionSignaturePayloadTaggedTransaction, TransactionV1Envelope, Uint256, WriteXdr,
};

use super::strkey;

pub struct PaymentParams<'a> {
    /// ed25519 seed bytes of the source wallet
    pub source_seed: [u8; 32],
    /// G... destination address
    pub destination: &'a str,
    /// 4-char asset code, e.g. b"MXNe"
    pub asset_code: [u8; 4],
    /// G... issuer address
    pub asset_issuer: &'a str,
    /// Amount in stroops (1 MXNe = 10_000_000)
    pub amount_stroops: i64,
    /// Short memo string (max 28 bytes)
    pub memo: &'a str,
    /// Current sequence number of source account (will be incremented by 1)
    pub sequence: i64,
    /// Base fee in stroops (100 = 0.00001 XLM)
    pub fee: u32,
    /// SHA-256 of network passphrase
    pub network_hash: [u8; 32],
}

/// Build, sign, and base64-encode a payment transaction envelope.
pub fn build_and_sign(p: PaymentParams<'_>) -> Result<String> {
    // ── Keys ──────────────────────────────────────────────────────────────
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&p.source_seed);
    let source_pub = signing_key.verifying_key().to_bytes();
    let dest_bytes = strkey::decode_address(p.destination).context("bad destination")?;
    let issuer_bytes = strkey::decode_address(p.asset_issuer).context("bad issuer")?;

    // ── Payment operation ──────────────────────────────────────────────────
    let operation = Operation {
        source_account: None,
        body: OperationBody::Payment(PaymentOp {
            destination: MuxedAccount::Ed25519(Uint256(dest_bytes)),
            asset: Asset::CreditAlphanum4(AlphaNum4 {
                asset_code: AssetCode4(p.asset_code),
                issuer: AccountId(PublicKey::PublicKeyTypeEd25519(Uint256(issuer_bytes))),
            }),
            amount: p.amount_stroops,
        }),
    };

    // ── Memo ──────────────────────────────────────────────────────────────
    let memo_bytes = p.memo.as_bytes().to_vec();
    let memo_str: StringM<28> =
        memo_bytes.try_into().map_err(|_| anyhow::anyhow!("memo too long (max 28 bytes)"))?;

    // ── Transaction ───────────────────────────────────────────────────────
    let tx = Transaction {
        source_account: MuxedAccount::Ed25519(Uint256(source_pub)),
        fee: p.fee,
        seq_num: SequenceNumber(p.sequence + 1),
        cond: Preconditions::None,
        memo: Memo::Text(memo_str),
        operations: vec![operation]
            .try_into()
            .map_err(|_| anyhow::anyhow!("operations overflow"))?,
        ext: TransactionExt::V0,
    };

    // ── Sign ──────────────────────────────────────────────────────────────
    let payload = TransactionSignaturePayload {
        network_id: Hash(p.network_hash),
        tagged_transaction: TransactionSignaturePayloadTaggedTransaction::Tx(tx.clone()),
    };
    let payload_xdr = payload.to_xdr(Limits::none()).context("serialize payload")?;
    let hash_bytes: [u8; 32] = Sha256::digest(&payload_xdr).into();

    let ed_signature = signing_key.sign(&hash_bytes);
    let hint = SignatureHint(source_pub[28..32].try_into().unwrap());
    let sig_bytes: BytesM<64> = ed_signature
        .to_bytes()
        .to_vec()
        .try_into()
        .map_err(|_| anyhow::anyhow!("signature overflow"))?;

    let decorated = DecoratedSignature { hint, signature: Signature(sig_bytes) };

    // ── Envelope ──────────────────────────────────────────────────────────
    let envelope = TransactionEnvelope::Tx(TransactionV1Envelope {
        tx,
        signatures: vec![decorated]
            .try_into()
            .map_err(|_| anyhow::anyhow!("signatures overflow"))?,
    });

    let xdr = envelope.to_xdr(Limits::none()).context("serialize envelope")?;
    Ok(B64.encode(&xdr))
}

/// Dos pagos MXNe en una sola transacción: comercio (neto) + plataforma (comisión).
pub struct SplitPaymentParams<'a> {
    pub source_seed: [u8; 32],
    pub asset_code: [u8; 4],
    pub asset_issuer: &'a str,
    pub merchant_destination: &'a str,
    pub merchant_stroops: i64,
    pub platform_destination: &'a str,
    pub platform_stroops: i64,
    pub memo: &'a str,
    pub sequence: i64,
    /// Fee por operación en stroops (típ. 100); total red = fee * num_ops.
    pub fee_per_operation: u32,
    pub network_hash: [u8; 32],
}

pub fn build_two_payments_and_sign(p: SplitPaymentParams<'_>) -> Result<String> {
    anyhow::ensure!(p.merchant_stroops > 0, "merchant amount must be > 0");
    anyhow::ensure!(p.platform_stroops >= 0, "platform amount must be >= 0");
    anyhow::ensure!(p.merchant_stroops + p.platform_stroops > 0, "total amount must be > 0");

    let signing_key = ed25519_dalek::SigningKey::from_bytes(&p.source_seed);
    let source_pub = signing_key.verifying_key().to_bytes();
    let issuer_bytes = strkey::decode_address(p.asset_issuer).context("bad issuer")?;
    let alpha = AlphaNum4 {
        asset_code: AssetCode4(p.asset_code),
        issuer: AccountId(PublicKey::PublicKeyTypeEd25519(Uint256(issuer_bytes))),
    };

    let mdest = strkey::decode_address(p.merchant_destination).context("bad merchant dest")?;
    let pdest = strkey::decode_address(p.platform_destination).context("bad platform dest")?;

    let op_merchant = Operation {
        source_account: None,
        body: OperationBody::Payment(PaymentOp {
            destination: MuxedAccount::Ed25519(Uint256(mdest)),
            asset: Asset::CreditAlphanum4(alpha.clone()),
            amount: p.merchant_stroops,
        }),
    };

    let op_platform = Operation {
        source_account: None,
        body: OperationBody::Payment(PaymentOp {
            destination: MuxedAccount::Ed25519(Uint256(pdest)),
            asset: Asset::CreditAlphanum4(alpha),
            amount: p.platform_stroops,
        }),
    };

    let memo_bytes = p.memo.as_bytes().to_vec();
    let memo_str: StringM<28> =
        memo_bytes.try_into().map_err(|_| anyhow::anyhow!("memo too long (max 28 bytes)"))?;

    let ops = vec![op_merchant, op_platform];
    let tx = Transaction {
        source_account: MuxedAccount::Ed25519(Uint256(source_pub)),
        fee: p.fee_per_operation,
        seq_num: SequenceNumber(p.sequence + 1),
        cond: Preconditions::None,
        memo: Memo::Text(memo_str),
        operations: ops.try_into().map_err(|_| anyhow::anyhow!("operations overflow"))?,
        ext: TransactionExt::V0,
    };

    let payload = TransactionSignaturePayload {
        network_id: Hash(p.network_hash),
        tagged_transaction: TransactionSignaturePayloadTaggedTransaction::Tx(tx.clone()),
    };
    let payload_xdr = payload.to_xdr(Limits::none()).context("serialize payload")?;
    let hash_bytes: [u8; 32] = Sha256::digest(&payload_xdr).into();

    let ed_signature = signing_key.sign(&hash_bytes);
    let hint = SignatureHint(source_pub[28..32].try_into().unwrap());
    let sig_bytes: BytesM<64> = ed_signature
        .to_bytes()
        .to_vec()
        .try_into()
        .map_err(|_| anyhow::anyhow!("signature overflow"))?;

    let decorated = DecoratedSignature { hint, signature: Signature(sig_bytes) };

    let envelope = TransactionEnvelope::Tx(TransactionV1Envelope {
        tx,
        signatures: vec![decorated]
            .try_into()
            .map_err(|_| anyhow::anyhow!("signatures overflow"))?,
    });

    let xdr = envelope.to_xdr(Limits::none()).context("serialize envelope")?;
    Ok(B64.encode(&xdr))
}

// ─── Change trust (MXNe línea de crédito) ───────────────────────────────────

pub struct ChangeTrustParams<'a> {
    pub source_seed: [u8; 32],
    pub asset_code: [u8; 4],
    pub asset_issuer: &'a str,
    /// Límite en unidades mínimas del activo (stroops); `i64::MAX` ≈ sin tope práctico.
    pub limit: i64,
    pub sequence: i64,
    pub fee: u32,
    pub network_hash: [u8; 32],
}

pub fn build_change_trust_and_sign(p: ChangeTrustParams<'_>) -> Result<String> {
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&p.source_seed);
    let source_pub = signing_key.verifying_key().to_bytes();
    let issuer_bytes = strkey::decode_address(p.asset_issuer).context("bad issuer")?;

    let operation = Operation {
        source_account: None,
        body: OperationBody::ChangeTrust(ChangeTrustOp {
            line: ChangeTrustAsset::CreditAlphanum4(AlphaNum4 {
                asset_code: AssetCode4(p.asset_code),
                issuer: AccountId(PublicKey::PublicKeyTypeEd25519(Uint256(issuer_bytes))),
            }),
            limit: p.limit,
        }),
    };

    let tx = Transaction {
        source_account: MuxedAccount::Ed25519(Uint256(source_pub)),
        fee: p.fee,
        seq_num: SequenceNumber(p.sequence + 1),
        cond: Preconditions::None,
        memo: Memo::None,
        operations: vec![operation]
            .try_into()
            .map_err(|_| anyhow::anyhow!("operations overflow"))?,
        ext: TransactionExt::V0,
    };

    let payload = TransactionSignaturePayload {
        network_id: Hash(p.network_hash),
        tagged_transaction: TransactionSignaturePayloadTaggedTransaction::Tx(tx.clone()),
    };
    let payload_xdr = payload.to_xdr(Limits::none()).context("serialize payload")?;
    let hash_bytes: [u8; 32] = Sha256::digest(&payload_xdr).into();

    let ed_signature = signing_key.sign(&hash_bytes);
    let hint = SignatureHint(source_pub[28..32].try_into().unwrap());
    let sig_bytes: BytesM<64> = ed_signature
        .to_bytes()
        .to_vec()
        .try_into()
        .map_err(|_| anyhow::anyhow!("signature overflow"))?;

    let decorated = DecoratedSignature { hint, signature: Signature(sig_bytes) };

    let envelope = TransactionEnvelope::Tx(TransactionV1Envelope {
        tx,
        signatures: vec![decorated]
            .try_into()
            .map_err(|_| anyhow::anyhow!("signatures overflow"))?,
    });

    let xdr = envelope.to_xdr(Limits::none()).context("serialize envelope")?;
    Ok(B64.encode(&xdr))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_does_not_panic() {
        // Dummy data — just checks the XDR encoding path
        let seed = [1u8; 32];
        let dest = strkey::encode_address(&[2u8; 32]);
        let issuer = strkey::encode_address(&[3u8; 32]);

        let result = build_and_sign(PaymentParams {
            source_seed: seed,
            destination: &dest,
            asset_code: *b"MXNe",
            asset_issuer: &issuer,
            amount_stroops: 100_000_000,
            memo: "TEST1234",
            sequence: 12345,
            fee: 100,
            network_hash: Sha256::digest(b"Test SDF Network ; September 2015").into(),
        });
        assert!(result.is_ok(), "{:?}", result);
    }
}
