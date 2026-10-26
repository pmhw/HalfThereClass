-- AlterTable (SQLite: FK enforced via Prisma schema; no ALTER ADD CONSTRAINT)
ALTER TABLE "courses" ADD COLUMN "organization_id" INTEGER;
ALTER TABLE "courses" ADD COLUMN "org_commission_mode" TEXT;
ALTER TABLE "courses" ADD COLUMN "org_commission_value" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "courses_organization_id_idx" ON "courses"("organization_id");
