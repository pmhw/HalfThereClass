-- AlterTable
ALTER TABLE "courses" ADD COLUMN "teacher_share_mode" TEXT NOT NULL DEFAULT 'percent';
ALTER TABLE "courses" ADD COLUMN "teacher_share_value" REAL NOT NULL DEFAULT 50;
ALTER TABLE "courses" ADD COLUMN "institution_share_mode" TEXT NOT NULL DEFAULT 'percent';
ALTER TABLE "courses" ADD COLUMN "institution_share_value" REAL NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "profit_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "order_id" INTEGER NOT NULL,
    "course_id" INTEGER NOT NULL,
    "teacher_id" INTEGER,
    "institution_id" INTEGER,
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
    "order_status" TEXT NOT NULL DEFAULT 'paid',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" DATETIME,
    CONSTRAINT "profit_records_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "profit_records_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "profit_records_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "profit_records_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "organizations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "monthly_settlements" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "total_amount" REAL NOT NULL DEFAULT 0,
    "teacher_amount" REAL NOT NULL DEFAULT 0,
    "institution_amount" REAL NOT NULL DEFAULT 0,
    "platform_amount" REAL NOT NULL DEFAULT 0,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "settled_at" DATETIME,
    "settled_by" INTEGER,
    "note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "monthly_settlements_month_key" UNIQUE ("month")
);

-- CreateIndex
CREATE UNIQUE INDEX "profit_records_order_id_key" ON "profit_records"("order_id");
CREATE INDEX "profit_records_course_id_idx" ON "profit_records"("course_id");
CREATE INDEX "profit_records_teacher_id_idx" ON "profit_records"("teacher_id");
CREATE INDEX "profit_records_institution_id_idx" ON "profit_records"("institution_id");
CREATE INDEX "profit_records_settlement_month_idx" ON "profit_records"("settlement_month");
CREATE INDEX "profit_records_settlement_status_idx" ON "profit_records"("settlement_status");
