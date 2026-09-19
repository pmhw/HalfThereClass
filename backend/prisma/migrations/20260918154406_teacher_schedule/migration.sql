-- CreateTable
CREATE TABLE "teacher_certs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "real_name" TEXT NOT NULL,
    "teacher_no" TEXT,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "id_card" TEXT,
    "diploma" TEXT,
    "clearance" TEXT,
    "certificate" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "teacher_certs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "course_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "place" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "check_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "check_ins_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_courses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover" TEXT,
    "price" REAL NOT NULL DEFAULT 0,
    "original_price" REAL,
    "category_id" INTEGER NOT NULL,
    "teacher_id" INTEGER,
    "school" TEXT,
    "classroom" TEXT,
    "grade_label" TEXT,
    "weekday" INTEGER,
    "start_time" TEXT,
    "end_time" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "level" TEXT DEFAULT 'beginner',
    "student_count" INTEGER NOT NULL DEFAULT 0,
    "lesson_count" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "rating" REAL NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "is_recommend" BOOLEAN NOT NULL DEFAULT false,
    "is_hot" BOOLEAN NOT NULL DEFAULT false,
    "status" INTEGER NOT NULL DEFAULT 1,
    "published_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "courses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "courses_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_courses" ("category_id", "cover", "created_at", "description", "duration", "id", "is_free", "is_hot", "is_recommend", "lesson_count", "level", "original_price", "price", "published_at", "rating", "review_count", "status", "student_count", "teacher_id", "title", "updated_at") SELECT "category_id", "cover", "created_at", "description", "duration", "id", "is_free", "is_hot", "is_recommend", "lesson_count", "level", "original_price", "price", "published_at", "rating", "review_count", "status", "student_count", "teacher_id", "title", "updated_at" FROM "courses";
DROP TABLE "courses";
ALTER TABLE "new_courses" RENAME TO "courses";
CREATE INDEX "courses_category_id_idx" ON "courses"("category_id");
CREATE INDEX "courses_teacher_id_idx" ON "courses"("teacher_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "teacher_certs_user_id_key" ON "teacher_certs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_certs_teacher_no_key" ON "teacher_certs"("teacher_no");

-- CreateIndex
CREATE UNIQUE INDEX "check_ins_user_id_course_id_date_key" ON "check_ins"("user_id", "course_id", "date");
