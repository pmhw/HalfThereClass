-- AlterTable
ALTER TABLE "categories" ADD COLUMN "parent_id" INTEGER;

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");
