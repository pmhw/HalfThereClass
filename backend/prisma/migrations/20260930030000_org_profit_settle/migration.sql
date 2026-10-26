-- AlterTable: 利润快照记录课时费与结算对象
ALTER TABLE "profit_records" ADD COLUMN "session_fee" DOUBLE PRECISION;
ALTER TABLE "profit_records" ADD COLUMN "settle_to" TEXT NOT NULL DEFAULT 'teacher';
ALTER TABLE "profit_records" ADD COLUMN "org_settle_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;
