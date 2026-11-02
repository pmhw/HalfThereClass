-- 开票可关联个人：税额从该人分成中扣除（未关联个人时仍从合集分成池扣除）
ALTER TABLE "finance_invoices" ADD COLUMN "user_id" INTEGER;
ALTER TABLE "finance_invoices" ADD COLUMN "user_name" TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "finance_invoices_user_id_idx" ON "finance_invoices"("user_id");
