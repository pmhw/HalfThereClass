-- CreateTable: 分成合集
CREATE TABLE IF NOT EXISTS "split_collections" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "course_ids" TEXT NOT NULL DEFAULT '[]',
    "members" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
