-- Recargas SPEI entrantes (OpenPay → MXNe al wallet Stellar del usuario)
CREATE TABLE IF NOT EXISTS deposit_requests (
    id              VARCHAR(36)   PRIMARY KEY,
    user_id         VARCHAR(36)   NOT NULL,
    amount_stroops  BIGINT        NOT NULL,
    openpay_id      VARCHAR(64),                 -- ID del cargo en OpenPay
    clabe           VARCHAR(20),                 -- CLABE generada para el depósito
    bank_name       VARCHAR(100),
    status          VARCHAR(20)   NOT NULL DEFAULT 'pending',   -- pending | completed | failed
    stellar_tx_hash VARCHAR(64),
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_dep_user    (user_id),
    INDEX idx_dep_status  (status),
    INDEX idx_dep_openpay (openpay_id)
);

-- Transferencias bancarias salientes (MXNe del wallet → SPEI a CLABE destino)
CREATE TABLE IF NOT EXISTS bank_transfers (
    id                VARCHAR(36)   PRIMARY KEY,
    user_id           VARCHAR(36)   NOT NULL,
    amount_stroops    BIGINT        NOT NULL,
    destination_clabe VARCHAR(20)   NOT NULL,
    holder_name       VARCHAR(100)  NOT NULL,
    description       TEXT,
    openpay_id        VARCHAR(64),                -- ID del payout en OpenPay
    stellar_tx_hash   VARCHAR(64),                -- Hash del tx que dedujo MXNe
    status            VARCHAR(20)   NOT NULL DEFAULT 'pending',  -- pending | completed | failed
    created_at        DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_bt_user   (user_id),
    INDEX idx_bt_status (status)
);
