-- 交易流水归属操作审计：禁止物理删除归属，解除锁定须留痕
CREATE TABLE IF NOT EXISTS "bank_txn_alloc_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "txn_id" INTEGER NOT NULL,
    "alloc_id" INTEGER,
    "action" TEXT NOT NULL,
    "admin_id" INTEGER,
    "admin_name" TEXT NOT NULL DEFAULT '',
    "user_id" INTEGER,
    "name" TEXT NOT NULL DEFAULT '',
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "user_agent" TEXT NOT NULL DEFAULT '',
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_txn_alloc_logs_txn_id_fkey" FOREIGN KEY ("txn_id") REFERENCES "bank_txns" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "bank_txn_alloc_logs_txn_id_idx" ON "bank_txn_alloc_logs"("txn_id");
CREATE INDEX IF NOT EXISTS "bank_txn_alloc_logs_alloc_id_idx" ON "bank_txn_alloc_logs"("alloc_id");
CREATE INDEX IF NOT EXISTS "bank_txn_alloc_logs_admin_id_idx" ON "bank_txn_alloc_logs"("admin_id");
CREATE INDEX IF NOT EXISTS "bank_txn_alloc_logs_created_at_idx" ON "bank_txn_alloc_logs"("created_at");
