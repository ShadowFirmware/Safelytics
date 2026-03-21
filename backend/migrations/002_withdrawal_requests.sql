CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id            VARCHAR(36)  PRIMARY KEY,
    merchant_id   VARCHAR(36)  NOT NULL,
    amount_mxn    DECIMAL(18, 2) NOT NULL,
    bank_account  VARCHAR(64)  NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'pending',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    INDEX idx_wr_merchant (merchant_id),
    INDEX idx_wr_status   (status)
);
