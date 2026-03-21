# Backend PagaLoop

## Requisitos

- Rust (edition 2021)
- MySQL 8.x

## Configuración

Copia `.env.example` a `.env` y rellena valores. **No subas `.env` al repositorio.**

Variables importantes: `DATABASE_URL`, `JWT_SECRET`, `KEY_ENCRYPTION_SECRET`, `MXNE_ISSUER`, `PLATFORM_FEE_RECEIVER` (si usas split de comisión).

## Comandos útiles

```bash
cargo fmt
cargo clippy
cargo run
```

Las migraciones SQL se aplican al iniciar (`src/db.rs`).

## Estructura

- `src/routes/` — handlers HTTP
- `src/stellar/` — Horizon, XDR, pagos
- `migrations/` — esquema MySQL
