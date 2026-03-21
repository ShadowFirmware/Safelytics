//! Stellar StrKey encoding/decoding (G... addresses, S... secret seeds).
//! Spec: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0023.md

use anyhow::{bail, Context, Result};
use data_encoding::BASE32_NOPAD;

const VERSION_ACCOUNT_ID: u8 = 6 << 3; // 'G' → 48
const VERSION_SEED: u8 = 18 << 3; // 'S' → 144

// ---------- CRC-16 CCITT XModem ----------

fn crc16(data: &[u8]) -> u16 {
    let mut crc: u16 = 0x0000;
    for &byte in data {
        let mut x = ((crc >> 8) ^ byte as u16) & 0xFF;
        x ^= x >> 4;
        crc = (crc << 8) ^ (x << 12) ^ (x << 5) ^ x;
    }
    crc
}

// ---------- Generic encode/decode ----------

fn encode(version: u8, payload: &[u8]) -> String {
    let mut data = Vec::with_capacity(1 + payload.len() + 2);
    data.push(version);
    data.extend_from_slice(payload);
    let crc = crc16(&data);
    data.push((crc & 0xFF) as u8);
    data.push((crc >> 8) as u8);
    BASE32_NOPAD.encode(&data)
}

fn decode(version: u8, input: &str) -> Result<Vec<u8>> {
    let raw = BASE32_NOPAD.decode(input.as_bytes()).context("invalid base32")?;
    if raw.len() < 3 {
        bail!("strkey too short");
    }
    if raw[0] != version {
        bail!("wrong strkey version byte");
    }
    let payload = &raw[..raw.len() - 2];
    let got_crc = (raw[raw.len() - 1] as u16) << 8 | raw[raw.len() - 2] as u16;
    let want_crc = crc16(payload);
    if got_crc != want_crc {
        bail!("strkey checksum mismatch");
    }
    Ok(payload[1..].to_vec())
}

// ---------- Public API ----------

/// Encode 32 raw bytes as a Stellar public address (G...)
pub fn encode_address(raw: &[u8; 32]) -> String {
    encode(VERSION_ACCOUNT_ID, raw)
}

/// Decode a G... address to 32 raw bytes
pub fn decode_address(addr: &str) -> Result<[u8; 32]> {
    let bytes = decode(VERSION_ACCOUNT_ID, addr)?;
    if bytes.len() != 32 {
        bail!("address payload must be 32 bytes");
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Ok(out)
}

/// Encode 32 raw seed bytes as a Stellar secret (S...)
pub fn encode_secret(seed: &[u8; 32]) -> String {
    encode(VERSION_SEED, seed)
}

/// Decode a S... secret to 32 raw seed bytes
pub fn decode_secret(secret: &str) -> Result<[u8; 32]> {
    let bytes = decode(VERSION_SEED, secret)?;
    if bytes.len() != 32 {
        bail!("seed payload must be 32 bytes");
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_address() {
        let raw = [1u8; 32];
        let addr = encode_address(&raw);
        assert!(addr.starts_with('G'));
        let back = decode_address(&addr).unwrap();
        assert_eq!(raw, back);
    }

    #[test]
    fn roundtrip_secret() {
        let seed = [2u8; 32];
        let s = encode_secret(&seed);
        assert!(s.starts_with('S'));
        let back = decode_secret(&s).unwrap();
        assert_eq!(seed, back);
    }
}
