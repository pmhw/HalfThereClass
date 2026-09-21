-- AlterTable
ALTER TABLE "categories" ADD COLUMN "owner_id" INTEGER;

-- AlterTable
ALTER TABLE "semesters" ADD COLUMN "owner_id" INTEGER;

-- CreateIndex
CREATE INDEX "categories_owner_id_idx" ON "categories"("owner_id");

-- CreateIndex
CREATE INDEX "semesters_owner_id_idx" ON "semesters"("owner_id");
