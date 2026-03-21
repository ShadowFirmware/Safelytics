# Buenas prácticas — PagaLoop

## Seguridad

1. **Secretos solo en entorno local:** `JWT_SECRET`, `KEY_ENCRYPTION_SECRET`, `DATABASE_URL`, `MXNE_ISSUER_SECRET`, etc. van en `backend/.env` (ignorado por git).
2. **No** pegar secretos en issues, capturas ni scripts versionados. `run.bat` / `run.example.bat` solo deben fijar PATH y llamar a `cargo run`; el resto en `.env`.
3. Si migraste desde un `run.bat` con variables inline, cópialas una vez a `.env` y borra las líneas sensibles del script.
3. Claves Stellar de producción: hardware vault o gestor de secretos; nunca en código.

## Backend (Rust)

- **Formato:** `cargo fmt` (config en `backend/rustfmt.toml`).
- **Lint:** `cargo clippy` — corregir warnings antes de fusionar.
- **Errores:** preferir tipos `AppError` / `Result` coherentes; logs con `tracing` (sin datos sensibles).
- **SQL:** migraciones versionadas en `migrations/`; no editar migraciones ya aplicadas en producción.

## Mobile (TypeScript / React Native)

- **Tipos:** `npm run typecheck` (`tsc --noEmit`).
- **Lint:** `npm run lint` (Expo ESLint).
- **API:** URLs y secretos públicos solo vía `EXPO_PUBLIC_*` en `.env`.

## Git

- Commits pequeños y mensajes claros (`feat:`, `fix:`, `docs:`).
- Revisar `.gitignore` antes de `git add -A`.

## Revisiones

- Al menos una revisión en cambios que toquen pagos, firmas o BD.
