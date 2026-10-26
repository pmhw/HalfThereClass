-- AlterTable: 月度结算增加「固定」标记（固定后才计入收益报表）
ALTER TABLE "monthly_settlements" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "monthly_settlements" ADD COLUMN "locked_at" DATETIME;
ALTER TABLE "monthly_settlements" ADD COLUMN "locked_by" INTEGER;
ALTER TABLE "monthly_settlements" ADD COLUMN "cost_amount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "monthly_settlements" ADD COLUMN "session_count" INTEGER NOT NULL DEFAULT 0;
