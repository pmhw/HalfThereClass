-- 对公预留流水（税费 / 开票 / 留存 / 费用占用），不碰企业私户
CREATE TABLE IF NOT EXISTS "finance_reserve_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "month" TEXT NOT NULL DEFAULT '',
    "ref_type" TEXT NOT NULL DEFAULT '',
    "ref_key" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "admin_id" INTEGER,
    "admin_name" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "user_agent" TEXT NOT NULL DEFAULT '',
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "finance_reserve_entries_kind_idx" ON "finance_reserve_entries"("kind");
CREATE INDEX IF NOT EXISTS "finance_reserve_entries_month_idx" ON "finance_reserve_entries"("month");
CREATE INDEX IF NOT EXISTS "finance_reserve_entries_ref_type_ref_key_idx" ON "finance_reserve_entries"("ref_type", "ref_key");
CREATE INDEX IF NOT EXISTS "finance_reserve_entries_created_at_idx" ON "finance_reserve_entries"("created_at");

-- 对公费用登记与核销
CREATE TABLE IF NOT EXISTS "finance_expenses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "amount_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "month" TEXT NOT NULL DEFAULT '',
    "bank_txn_id" INTEGER,
    "reserve_hold_id" INTEGER,
    "reserve_clear_id" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "admin_id" INTEGER,
    "admin_name" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "finance_expenses_status_idx" ON "finance_expenses"("status");
CREATE INDEX IF NOT EXISTS "finance_expenses_category_idx" ON "finance_expenses"("category");
CREATE INDEX IF NOT EXISTS "finance_expenses_bank_txn_id_idx" ON "finance_expenses"("bank_txn_id");
CREATE INDEX IF NOT EXISTS "finance_expenses_month_idx" ON "finance_expenses"("month");
CREATE INDEX IF NOT EXISTS "finance_expenses_created_at_idx" ON "finance_expenses"("created_at");
