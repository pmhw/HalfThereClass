-- AlterTable
ALTER TABLE "admin_accounts" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'admin';

-- AlterTable
ALTER TABLE "courses" ADD COLUMN "owner_id" INTEGER;

-- CreateIndex
CREATE INDEX "courses_owner_id_idx" ON "courses"("owner_id");
