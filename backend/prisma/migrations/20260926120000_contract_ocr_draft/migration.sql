-- AlterTable
ALTER TABLE "teacher_certs" ADD COLUMN "ethnicity" TEXT;
ALTER TABLE "teacher_certs" ADD COLUMN "birthday" TEXT;
ALTER TABLE "teacher_certs" ADD COLUMN "issuing_authority" TEXT;
ALTER TABLE "teacher_certs" ADD COLUMN "id_valid_from" TEXT;
ALTER TABLE "teacher_certs" ADD COLUMN "id_valid_to" TEXT;
ALTER TABLE "teacher_certs" ADD COLUMN "ocr_status" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "teacher_certs" ADD COLUMN "ocr_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "teacher_certs" ADD COLUMN "ocr_raw" TEXT;
ALTER TABLE "teacher_certs" ADD COLUMN "ocr_error" TEXT;
ALTER TABLE "teacher_certs" ADD COLUMN "ocr_at" DATETIME;
ALTER TABLE "teacher_certs" ADD COLUMN "contract_flow_status" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "teacher_certs" ADD COLUMN "contract_draft_step" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "teacher_certs" ADD COLUMN "contract_draft_json" TEXT;
ALTER TABLE "teacher_certs" ADD COLUMN "contract_draft_at" DATETIME;

-- CreateIndex
CREATE INDEX "teacher_certs_ocr_status_idx" ON "teacher_certs"("ocr_status");

-- CreateTable
CREATE TABLE "id_ocr_audits" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "ocr_value" TEXT,
    "manual_value" TEXT,
    "operator_id" INTEGER,
    "operator_name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'teacher',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "id_ocr_audits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "teacher_certs" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "id_ocr_audits_user_id_idx" ON "id_ocr_audits"("user_id");
