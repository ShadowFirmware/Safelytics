# Compila el backend sin depender del MSVC instalado en Windows (útil con Docker Desktop / Linux).
# Uso: desde la raíz del repo → docker compose up --build
FROM rust:1-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/safelytics /usr/local/bin/safelytics
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["safelytics"]
