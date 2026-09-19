-- CreateTable
CREATE TABLE "schools" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "province" TEXT,
    "city" TEXT,
    "lng" REAL,
    "lat" REAL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "courses" ADD COLUMN "school_id" INTEGER;
ALTER TABLE "courses" ADD COLUMN "province" TEXT;
ALTER TABLE "courses" ADD COLUMN "city" TEXT;
