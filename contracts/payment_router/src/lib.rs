#![no_std]
//! PaymentRouter — contrato Soroban para pagos QR con split de comisión.
//!
//! Una sola invocación atómica transfiere MXNe del cliente al comercio
//! y, si hay comisión, a la cartera de la plataforma.

use soroban_sdk::{contract, contractimpl, token, Address, Env};

#[contract]
pub struct PaymentRouter;

#[contractimpl]
impl PaymentRouter {
    /// Pago con split de comisión.
    ///
    /// # Parámetros
    /// - `token`           — Dirección del contrato SAC de MXNe.
    /// - `from`            — Cartera del cliente (debe autorizar esta llamada).
    /// - `merchant`        — Cartera del comercio (recibe `merchant_amount`).
    /// - `fee_receiver`    — Cartera de la plataforma (recibe `fee_amount`).
    /// - `merchant_amount` — Monto neto al comercio en stroops (1 MXNe = 10 000 000).
    /// - `fee_amount`      — Comisión de plataforma en stroops (0 = sin comisión).
    pub fn pay(
        env: Env,
        token: Address,
        from: Address,
        merchant: Address,
        fee_receiver: Address,
        merchant_amount: i128,
        fee_amount: i128,
    ) {
        // El cliente debe autorizar explícitamente la operación.
        from.require_auth();

        let client = token::Client::new(&env, &token);

        if merchant_amount > 0 {
            client.transfer(&from, &merchant, &merchant_amount);
        }

        if fee_amount > 0 {
            client.transfer(&from, &fee_receiver, &fee_amount);
        }
    }
}
