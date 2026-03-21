ALTER TABLE payments
    ADD COLUMN platform_fee_stroops BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN merchant_net_stroops BIGINT NOT NULL DEFAULT 0;
