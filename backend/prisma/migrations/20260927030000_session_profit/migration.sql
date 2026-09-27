-- 利润改按课次：校方价格 − 课时费 − 机构分佣
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_profit_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "session_income_id" INTEGER,
    "course_id" INTEGER NOT NULL,
    "teacher_id" INTEGER,
    "institution_id" INTEGER,
    "session_date" TEXT,
    "total_amount" REAL NOT NULL,
    "refund_amount" REAL NOT NULL DEFAULT 0,
    "teacher_amount" REAL NOT NULL DEFAULT 0,
    "institution_amount" REAL NOT NULL DEFAULT 0,
    "platform_amount" REAL NOT NULL DEFAULT 0,
    "teacher_rate" REAL,
    "institution_rate" REAL,
    "platform_rate" REAL,
    "teacher_share_mode" TEXT,
    "institution_share_mode" TEXT,
    "settlement_status" TEXT NOT NULL DEFAULT 'pending',
    "settlement_month" TEXT NOT NULL,
    "order_status" TEXT NOT NULL DEFAULT 'session',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" DATETIME,
    CONSTRAINT "new_profit_records_session_income_id_fkey" FOREIGN KEY ("session_income_id") REFERENCES "session_incomes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "new_profit_records_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "new_profit_records_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "new_profit_records_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "organizations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

DROP TABLE IF EXISTS "profit_records";
ALTER TABLE "new_profit_records" RENAME TO "profit_records";

CREATE UNIQUE INDEX "profit_records_session_income_id_key" ON "profit_records"("session_income_id");
CREATE INDEX "profit_records_course_id_idx" ON "profit_records"("course_id");
CREATE INDEX "profit_records_teacher_id_idx" ON "profit_records"("teacher_id");
CREATE INDEX "profit_records_institution_id_idx" ON "profit_records"("institution_id");
CREATE INDEX "profit_records_settlement_month_idx" ON "profit_records"("settlement_month");
CREATE INDEX "profit_records_settlement_status_idx" ON "profit_records"("settlement_status");

PRAGMA foreign_keys=ON;
