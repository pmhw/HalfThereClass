-- 浦发交易查询流水，以及按金额锁定的资金归属
CREATE TABLE IF NOT EXISTS "bank_txns" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_no" TEXT NOT NULL,
    "account_name" TEXT NOT NULL DEFAULT '',
    "txn_date" TEXT NOT NULL,
    "txn_time" TEXT NOT NULL DEFAULT '',
    "apply_date" TEXT NOT NULL DEFAULT '',
    "voucher_no" TEXT NOT NULL DEFAULT '',
    "direction" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "balance_cents" INTEGER,
    "counter_account" TEXT NOT NULL DEFAULT '',
    "counter_name" TEXT NOT NULL DEFAULT '',
    "counter_bank" TEXT NOT NULL DEFAULT '',
    "serial_no" TEXT NOT NULL DEFAULT '',
    "slip_no" TEXT NOT NULL DEFAULT '',
    "record_status" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "remark" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_txn_natural_key" ON "bank_txns"("account_no", "serial_no", "slip_no", "txn_date", "txn_time", "direction", "amount_cents");
CREATE INDEX IF NOT EXISTS "bank_txns_txn_date_idx" ON "bank_txns"("txn_date");
CREATE INDEX IF NOT EXISTS "bank_txns_remark_idx" ON "bank_txns"("remark");

CREATE TABLE IF NOT EXISTS "bank_txn_allocs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "txn_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "name" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "locked" BOOLEAN NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_txn_allocs_txn_id_fkey" FOREIGN KEY ("txn_id") REFERENCES "bank_txns" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "bank_txn_allocs_txn_id_idx" ON "bank_txn_allocs"("txn_id");
CREATE INDEX IF NOT EXISTS "bank_txn_allocs_user_id_idx" ON "bank_txn_allocs"("user_id");
