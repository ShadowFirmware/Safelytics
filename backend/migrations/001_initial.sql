CREATE TABLE IF NOT EXISTS users (
    id                       VARCHAR(36)  PRIMARY KEY,
    phone                    VARCHAR(20)  UNIQUE NOT NULL,
    name                     VARCHAR(100) NOT NULL,
    password_hash            VARCHAR(255) NOT NULL,
    stellar_public_key       VARCHAR(56)  NOT NULL UNIQUE,
    stellar_secret_encrypted TEXT         NOT NULL,
    created_at               DATETIME     DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS merchants (
    id                       VARCHAR(36)  PRIMARY KEY,
    business_name            VARCHAR(100) NOT NULL,
    phone                    VARCHAR(20)  UNIQUE NOT NULL,
    password_hash            VARCHAR(255) NOT NULL,
    stellar_public_key       VARCHAR(56)  NOT NULL UNIQUE,
    stellar_secret_encrypted TEXT         NOT NULL,
    created_at               DATETIME     DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_intents (
    id             VARCHAR(36)  PRIMARY KEY,
    merchant_id    VARCHAR(36)  NOT NULL,
    amount_stroops BIGINT       NOT NULL,
    description    TEXT,
    memo           VARCHAR(8)   NOT NULL,
    status         VARCHAR(20)  NOT NULL DEFAULT 'pending',
    expires_at     DATETIME     NOT NULL,
    created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    INDEX idx_pi_merchant (merchant_id),
    INDEX idx_pi_status   (status)
);

CREATE TABLE IF NOT EXISTS payments (
    id                VARCHAR(36)  PRIMARY KEY,
    payment_intent_id VARCHAR(36)  NOT NULL,
    customer_id       VARCHAR(36)  NOT NULL,
    amount_stroops    BIGINT       NOT NULL,
    stellar_tx_hash   VARCHAR(64),
    status            VARCHAR(20)  NOT NULL DEFAULT 'pending',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_intent_id) REFERENCES payment_intents(id),
    FOREIGN KEY (customer_id)       REFERENCES users(id),
    INDEX idx_pay_customer (customer_id),
    INDEX idx_pay_intent   (payment_intent_id),
    INDEX idx_pay_tx       (stellar_tx_hash)
);
