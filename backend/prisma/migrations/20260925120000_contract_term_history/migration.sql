-- 合同学期有效期、签署历史、预分配锁定
ALTER TABLE "teacher_certs" ADD COLUMN "contract_semester_id" INTEGER;

ALTER TABLE "teacher_course_grants" ADD COLUMN "lock_state" TEXT NOT NULL DEFAULT 'active';

CREATE TABLE "teacher_contracts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "semester_id" INTEGER,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sign_path" TEXT NOT NULL,
    "export_html" TEXT,
    "course_ids" TEXT,
    "course_annex" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reject_reason" TEXT,
    "signed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" DATETIME,
    "reviewed_by" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teacher_contracts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "teacher_contracts_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "teacher_contracts_user_id_index" ON "teacher_contracts"("user_id");
CREATE INDEX "teacher_contracts_status_index" ON "teacher_contracts"("status");
CREATE INDEX "teacher_certs_status_index" ON "teacher_certs"("status");

-- 回填：已签合同记入历史，并挂到当前学期（若有）
INSERT INTO "teacher_contracts" ("user_id", "semester_id", "title", "body", "sign_path", "status", "signed_at", "reviewed_at")
SELECT c."user_id",
       c."contract_semester_id",
       '教师服务合同',
       '（历史合同快照：系统升级前签署，正文以当时后台模板为准）',
       COALESCE(c."contract_sign", ''),
       'approved',
       COALESCE(c."contract_signed_at", CURRENT_TIMESTAMP),
       COALESCE(c."contract_signed_at", CURRENT_TIMESTAMP)
FROM "teacher_certs" c
WHERE c."contract_status" = 'signed' AND COALESCE(c."contract_sign", '') != '';

UPDATE "teacher_certs"
SET "contract_semester_id" = (
  SELECT s."id" FROM "semesters" s
  WHERE s."status" = 1
  ORDER BY s."id" DESC LIMIT 1
)
WHERE "contract_status" = 'signed' AND "contract_semester_id" IS NULL;
