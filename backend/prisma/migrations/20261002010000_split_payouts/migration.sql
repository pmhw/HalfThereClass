-- CreateTable: 财务打款（分成收款人按月）
CREATE TABLE IF NOT EXISTS "split_payouts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "month" TEXT NOT NULL,
    "payee_key" TEXT NOT NULL,
    "user_id" INTEGER,
    "name" TEXT NOT NULL,
    "gross" REAL NOT NULL DEFAULT 0,
    "tax" REAL NOT NULL DEFAULT 0,
    "fee" REAL NOT NULL DEFAULT 0,
    "net" REAL NOT NULL DEFAULT 0,
    "detail" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "paid_at" DATETIME,
    "paid_by" INTEGER,
    "note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "split_payouts_month_payee_key_key" ON "split_payouts"("month", "payee_key");
CREATE INDEX IF NOT EXISTS "split_payouts_month_idx" ON "split_payouts"("month");
