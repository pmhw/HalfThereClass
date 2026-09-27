-- CreateTable
CREATE TABLE "reimbursements" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "amount" REAL NOT NULL,
    "expense_date" TEXT NOT NULL,
    "description" TEXT,
    "attachments" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reject_reason" TEXT,
    "reviewed_at" DATETIME,
    "reviewed_by" INTEGER,
    "reimbursed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "reimbursements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "reimbursements_user_id_idx" ON "reimbursements"("user_id");

-- CreateIndex
CREATE INDEX "reimbursements_status_idx" ON "reimbursements"("status");
