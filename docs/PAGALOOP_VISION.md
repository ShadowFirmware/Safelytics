# PagaLoop — visión del producto vs. este repositorio

**Pitch:** pagos con QR para negocios pequeños en México. El cliente ve **MXN**; Stellar (y eventualmente stablecoins / path payments) queda **debajo**.

### Split on-chain (implementado)

Con `PLATFORM_FEE_BPS` y `PLATFORM_FEE_RECEIVER` (clave `G...` con trustline MXNe y saldo para recibir), el pago usa **dos operaciones Payment** en una transacción: neto al comercio + fee a la wallet de plataforma. Si no configuras `PLATFORM_FEE_RECEIVER` (o es igual al comercio), el pago va **íntegro** al comercio y se registra aviso en logs.

## Lo que ya cubre el código (Safelytics → PagaLoop UX)

| Visión | Estado |
|--------|--------|
| Comercio genera QR con monto + memo | ✅ `POST /api/qr/generate` + deep link `safelytics://pay/:id` |
| Cliente escanea y confirma en MXN | ✅ Flujo Expo + pantalla confirmar |
| Backend firma pago Stellar | ✅ `execute_payment` / `execute_split_payment` (MXNe; comisión a `PLATFORM_FEE_RECEIVER`) |
| Dos experiencias (comercio / cliente) | ✅ Rutas `merchant/*` y `customer/*` |
| Comisión configurable | ✅ `PLATFORM_FEE_BPS` + **cotización** `GET /api/qr/:id/quote` |
| Equivalente USDC “educativo” | ✅ `REFERENCE_MXN_PER_USDC` en cotización (no es path payment real) |
| Testnet: fondos de prueba | ✅ bootstrap + faucet (requiere `MXNE_ISSUER_SECRET`) |

## Huecos respecto al pitch “completo” (siguiente fases)

| Pieza | Por qué falta / qué hace falta |
|-------|--------------------------------|
| **Path payment** MXN→USDC on-chain | Requiere liquidez, anchors, y construcción XDR de `PathPaymentStrictSend` (u ops Soroban). Hoy el flujo es **pago MXNe** (split comercio/plataforma o pago único). |
| **Fee sponsor** | Cuenta que paga fees de red para el usuario; requiere diseño de sponsored transactions + fondos XLM del sponsor. |
| **Oráculo en vivo** | La cotización usa tipo de cambio **estático** (`REFERENCE_MXN_PER_USDC`). Producción: API (FX) + límites de antigüedad. |
| **SPEI / bancos** | Integración con **PSP regulado** (OpenPay, Conekta, Stripe México, banco, etc.): webhooks, KYC, payouts. El retiro “banco” actual solo **registra** solicitud en BD. |
| **Multi-divisa real** | Depende de anchor + cuentas por moneda o conversión en el PSP; no es solo cambiar strings en la app. |
| **Yield** | Producto financiero aparte; no implementado. |

## Principio de producto

1. **UX:** siempre **pesos** en pantallas principales.  
2. **Técnico:** Stellar como rail; el usuario no necesita saber qué es un trustline en producción (sponsor + custodia ligera o rampa).  
3. **Legal:** dinero fiat real solo vía **proveedores con licencia** en México.

## Nombres en el repo

- La app muestra **PagaLoop** en textos visibles.  
- El esquema de deep link puede seguir siendo `safelytics://` en QR ya generados; se puede añadir `pagaloop://` en paralelo cuando se regeneren QRs.
