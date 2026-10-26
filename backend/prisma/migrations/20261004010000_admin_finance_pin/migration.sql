-- AlterTable: 财务密码（全员共用，存 app_settings.finance_pin）的个人输错次数与锁定
ALTER TABLE "admin_accounts" ADD COLUMN "finance_pin_fails" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "admin_accounts" ADD COLUMN "finance_pin_locked_until" DATETIME;
