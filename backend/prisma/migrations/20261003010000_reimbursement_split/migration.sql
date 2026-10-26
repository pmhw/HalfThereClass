-- AlterTable: 报销单结算月份与扣除合集（从该合集当月利润中扣除）
ALTER TABLE "reimbursements" ADD COLUMN "month" TEXT;
ALTER TABLE "reimbursements" ADD COLUMN "split_collection_id" INTEGER;
CREATE INDEX IF NOT EXISTS "reimbursements_month_idx" ON "reimbursements"("month");
UPDATE "reimbursements" SET "month" = substr("expense_date", 1, 7) WHERE "month" IS NULL AND length("expense_date") >= 7;
