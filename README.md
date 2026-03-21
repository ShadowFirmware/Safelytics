# PagaLoop (Safelytics)

Pagos con QR para negocios pequeños; backend en **Rust**, app en **Expo / React Native**, cadena **Stellar** (testnet en desarrollo).

## Estructura

| Carpeta | Rol |
|---------|-----|
| `backend/` | API Axum, MySQL (SQLx), firmas Stellar |
| `mobile/` | App Expo (cliente + comercio) |
| `docs/` | Visión producto, wallet testnet, etc. |

## Arranque rápido

1. **MySQL** creado y usuario con permisos.
2. `backend/.env` — copia desde `backend/.env.example` y completa variables (sin subir secretos al repositorio).
3. Backend: `cd backend` → `cargo run` o `run.bat` (mejor: variables solo en `.env`, no en scripts versionados).
4. Mobile: `cd mobile` → `npm install` → `npx expo start` — ver `mobile/.env.example` para `EXPO_PUBLIC_API_URL` en dispositivo físico.

## Buenas prácticas (obligatorio en equipo)

- **No commitear** `.env`, `run.local.bat` con contraseñas, ni claves Stellar. El backend lee `backend/.env` (ver `.env.example`); `run.bat` solo debe preparar PATH y ejecutar `cargo run`.
- **Backend:** antes de PR — `cargo fmt` y `cargo clippy -- -D warnings` (o sin `-D` al inicio). En Windows: `.\scripts\dev-check-backend.ps1`.
- **Mobile:** `npm run typecheck` y `npm run lint`. En Windows: `.\scripts\dev-check-mobile.ps1`.
- **Migraciones:** solo archivos en `backend/migrations/`; se aplican al arrancar el servidor.

Si alguna vez versionaste secretos en git, **rótalos** (JWT, claves de cifrado, contraseña MySQL) y limpia el historial según tu política.

## Documentación

- `docs/PAGALOOP_VISION.md` — visión vs. código.
- `backend/docs/WALLET.md` — testnet, faucet, comisión on-chain.

## Licencia

Definir según el proyecto.
