# Cartera testnet: recargar y retirar

Todo el flujo usa **Stellar testnet** y el activo configurado en `MXNE_ASSET_CODE` / `MXNE_ISSUER`.

## 1. Preparar el emisor MXNe

La cuenta `MXNE_ISSUER` (clave `G...`) debe:

1. Existir en testnet (Friendbot: `https://friendbot.stellar.org?addr=G...`).
2. Tener XLM para fees.
3. Haber **creado** el activo MXNe (emitido hacia sí misma o con trustline de prueba).

En el servidor define el **secreto** del emisor (solo testnet):

```env
MXNE_ISSUER_SECRET=S....   # debe corresponder a MXNE_ISSUER
```

Sin `MXNE_ISSUER_SECRET`, el endpoint **faucet** (`POST /api/wallet/faucet-mxne`) responde error.

## 2. Flujo en la app (cliente o comercio)

1. **Preparar testnet** — `POST /api/wallet/bootstrap-testnet`  
   - Intenta Friendbot (XLM).  
   - Firma **ChangeTrust** hacia MXNe (trustline).

2. **Recibir MXNe** — `POST /api/wallet/faucet-mxne` con `{ "amount_mxn": 100 }`  
   - El emisor envía MXNe a la wallet del usuario autenticado.

3. **Retiro on-chain (comercio)** — `POST /api/merchant/withdraw-stellar`  
   - `{ "destination": "G...", "amount_mxn": 10 }`  
   - Envía MXNe desde la wallet del comercio.

4. **Retiro banco (simulado)** — `POST /api/merchant/withdraw`  
   - Guarda fila en `withdrawal_requests` (estado `pending`).  
   - En producción se enlazaría a un anchor / SPEI.

## 3. Wallet de comisión (`PLATFORM_FEE_RECEIVER`)

Para el **split on-chain** (comisión + neto al comercio en una sola transacción), la cuenta `G...` configurada debe tener **trustline MXNe** y poder recibir ese activo (igual que cualquier wallet de usuario).

## 4. Mainnet / dinero real

Para fiat real hace falta un **proveedor regulado** (anchor Stellar, PSP, etc.). Este proyecto no sustituye KYC ni transferencias bancarias reales.
