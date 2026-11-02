-- 企业私户账户与流水
CREATE TABLE IF NOT EXISTS "finance_private_accounts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "finance_private_accounts_user_id_idx" ON "finance_private_accounts"("user_id");
CREATE INDEX IF NOT EXISTS "finance_private_accounts_name_idx" ON "finance_private_accounts"("name");

CREATE TABLE IF NOT EXISTS "finance_private_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "bank_alloc_id" INTEGER,
    "bank_txn_id" INTEGER,
    "payout_month" TEXT NOT NULL DEFAULT '',
    "payout_key" TEXT NOT NULL DEFAULT '',
    "admin_id" INTEGER,
    "admin_name" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "user_agent" TEXT NOT NULL DEFAULT '',
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_private_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance_private_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "finance_private_entries_account_id_idx" ON "finance_private_entries"("account_id");
CREATE INDEX IF NOT EXISTS "finance_private_entries_kind_idx" ON "finance_private_entries"("kind");
CREATE INDEX IF NOT EXISTS "finance_private_entries_bank_alloc_id_idx" ON "finance_private_entries"("bank_alloc_id");
CREATE INDEX IF NOT EXISTS "finance_private_entries_payout_month_payout_key_idx" ON "finance_private_entries"("payout_month", "payout_key");
CREATE INDEX IF NOT EXISTS "finance_private_entries_created_at_idx" ON "finance_private_entries"("created_at");

-- 回填：已锁定的流水归属 → 企业私户入账
INSERT INTO "finance_private_accounts" ("user_id", "name", "created_at", "updated_at")
SELECT a."user_id", a."name", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT "user_id", "name", MIN("id") AS mid
  FROM "bank_txn_allocs"
  WHERE "locked" = 1
  GROUP BY COALESCE("user_id", -1), "name"
) a
WHERE NOT EXISTS (
  SELECT 1 FROM "finance_private_accounts" p
  WHERE (
    (a."user_id" IS NOT NULL AND p."user_id" = a."user_id")
    OR (a."user_id" IS NULL AND p."user_id" IS NULL AND p."name" = a."name")
  )
);

INSERT INTO "finance_private_entries" (
  "account_id", "kind", "direction", "amount_cents", "note",
  "bank_alloc_id", "bank_txn_id", "detail", "created_at"
)
SELECT
  p."id",
  'deposit_alloc',
  'in',
  a."amount_cents",
  a."note",
  a."id",
  a."txn_id",
  '迁移：流水归属划入企业私户',
  a."created_at"
FROM "bank_txn_allocs" a
JOIN "finance_private_accounts" p
  ON (
    (a."user_id" IS NOT NULL AND p."user_id" = a."user_id")
    OR (a."user_id" IS NULL AND p."user_id" IS NULL AND p."name" = a."name")
  )
WHERE a."locked" = 1
  AND NOT EXISTS (
    SELECT 1 FROM "finance_private_entries" e WHERE e."bank_alloc_id" = a."id" AND e."kind" = 'deposit_alloc'
  );
