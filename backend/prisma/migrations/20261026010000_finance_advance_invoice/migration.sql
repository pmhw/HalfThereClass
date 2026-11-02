-- 垫付单：对公资金不足时，由个人先垫入可用资金池，打款时消耗，进账后补还
CREATE TABLE IF NOT EXISTS "finance_advances" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER,
    "name" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_by" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "finance_advances_status_idx" ON "finance_advances"("status");
CREATE INDEX IF NOT EXISTS "finance_advances_user_id_idx" ON "finance_advances"("user_id");

-- 打款时从垫付池消耗
CREATE TABLE IF NOT EXISTS "finance_advance_uses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "advance_id" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "payee_keys" TEXT NOT NULL DEFAULT '[]',
    "created_by" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_advance_uses_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "finance_advances" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "finance_advance_uses_advance_id_idx" ON "finance_advance_uses"("advance_id");
CREATE INDEX IF NOT EXISTS "finance_advance_uses_month_idx" ON "finance_advance_uses"("month");

-- 进账补还垫付（自动匹配或手动确认）
CREATE TABLE IF NOT EXISTS "finance_advance_repays" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "advance_id" INTEGER NOT NULL,
    "bank_txn_id" INTEGER,
    "amount_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT NOT NULL DEFAULT '',
    "confirmed_at" DATETIME,
    "created_by" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_advance_repays_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "finance_advances" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "finance_advance_repays_bank_txn_id_fkey" FOREIGN KEY ("bank_txn_id") REFERENCES "bank_txns" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "finance_advance_repays_advance_id_idx" ON "finance_advance_repays"("advance_id");
CREATE INDEX IF NOT EXISTS "finance_advance_repays_bank_txn_id_idx" ON "finance_advance_repays"("bank_txn_id");
CREATE INDEX IF NOT EXISTS "finance_advance_repays_status_idx" ON "finance_advance_repays"("status");

-- 开票记录：税额在项目分成前从可分配中扣除
CREATE TABLE IF NOT EXISTS "finance_invoices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "month" TEXT NOT NULL,
    "collection_id" INTEGER,
    "title" TEXT NOT NULL DEFAULT '',
    "invoice_no" TEXT NOT NULL DEFAULT '',
    "seller_name" TEXT NOT NULL DEFAULT '',
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "pdf_path" TEXT NOT NULL DEFAULT '',
    "raw_text" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "note" TEXT NOT NULL DEFAULT '',
    "created_by" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "finance_invoices_month_idx" ON "finance_invoices"("month");
CREATE INDEX IF NOT EXISTS "finance_invoices_collection_id_idx" ON "finance_invoices"("collection_id");
CREATE INDEX IF NOT EXISTS "finance_invoices_status_idx" ON "finance_invoices"("status");
