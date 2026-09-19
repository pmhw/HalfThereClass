ALTER TABLE "teacher_certs" ADD COLUMN "contract_status" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "teacher_certs" ADD COLUMN "contract_signed_at" DATETIME;
ALTER TABLE "teacher_certs" ADD COLUMN "contract_sign" TEXT;
