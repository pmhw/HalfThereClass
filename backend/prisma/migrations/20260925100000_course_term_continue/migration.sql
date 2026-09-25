-- 课程当前学期、课次完成态、学期任课老师历史
ALTER TABLE "courses" ADD COLUMN "active_semester_id" INTEGER;
CREATE INDEX "courses_active_semester_id_index" ON "courses"("active_semester_id");

ALTER TABLE "course_sessions" ADD COLUMN "completion_mode" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "course_sessions" ADD COLUMN "completed_at" DATETIME;

CREATE TABLE "course_term_teachers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "course_id" INTEGER NOT NULL,
    "semester_id" INTEGER NOT NULL,
    "teacher_id" INTEGER NOT NULL,
    "assigned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    CONSTRAINT "course_term_teachers_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_term_teachers_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_term_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "course_term_teachers_course_id_semester_id_key" ON "course_term_teachers"("course_id", "semester_id");
CREATE INDEX "course_term_teachers_teacher_id_index" ON "course_term_teachers"("teacher_id");

-- 已有课次的课程：把最近学期记为当前学期
UPDATE "courses"
SET "active_semester_id" = (
  SELECT s."semester_id"
  FROM "course_sessions" s
  WHERE s."course_id" = "courses"."id"
  ORDER BY s."date" DESC, s."id" DESC
  LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM "course_sessions" s WHERE s."course_id" = "courses"."id");

-- 回填学期任课老师（用当前课程老师）
INSERT OR IGNORE INTO "course_term_teachers" ("course_id", "semester_id", "teacher_id")
SELECT c."id", c."active_semester_id", c."teacher_id"
FROM "courses" c
WHERE c."active_semester_id" IS NOT NULL AND c."teacher_id" IS NOT NULL;
