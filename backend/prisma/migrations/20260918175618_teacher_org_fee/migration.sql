-- AlterTable
ALTER TABLE "courses" ADD COLUMN "session_fee" REAL;

-- CreateTable
CREATE TABLE "organizations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "contact_name" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "intro" TEXT,
    "status" INTEGER NOT NULL DEFAULT 1,
    "fee_visibility" TEXT NOT NULL DEFAULT 'final',
    "commission_mode" TEXT NOT NULL DEFAULT 'percent',
    "commission_value" REAL NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "teacher_course_grants" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "course_id" INTEGER NOT NULL,
    "base_fee" REAL,
    "mode" TEXT,
    "value" REAL,
    "visibility" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teacher_course_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "teacher_course_grants_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "session_incomes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "course_id" INTEGER NOT NULL,
    "organization_id" INTEGER,
    "date" TEXT NOT NULL,
    "base_fee" REAL,
    "commission" REAL,
    "teacher_fee" REAL,
    "visibility" TEXT NOT NULL DEFAULT 'final',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_incomes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "session_incomes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_teacher_certs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "real_name" TEXT NOT NULL,
    "gender" TEXT,
    "teacher_no" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "id_card" TEXT,
    "diploma" TEXT,
    "clearance" TEXT,
    "certificate" TEXT,
    "bio" TEXT,
    "skills" TEXT,
    "reject_reason" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "teacher_certs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_teacher_certs" ("certificate", "clearance", "created_at", "diploma", "id", "id_card", "real_name", "status", "teacher_no", "updated_at", "user_id") SELECT "certificate", "clearance", "created_at", "diploma", "id", "id_card", "real_name", "status", "teacher_no", "updated_at", "user_id" FROM "teacher_certs";
DROP TABLE "teacher_certs";
ALTER TABLE "new_teacher_certs" RENAME TO "teacher_certs";
CREATE UNIQUE INDEX "teacher_certs_user_id_key" ON "teacher_certs"("user_id");
CREATE UNIQUE INDEX "teacher_certs_teacher_no_key" ON "teacher_certs"("teacher_no");
CREATE TABLE "new_users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "openid" TEXT NOT NULL,
    "nickname" TEXT,
    "avatar" TEXT,
    "phone" TEXT,
    "gender" TEXT,
    "unionid" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "status" INTEGER NOT NULL DEFAULT 1,
    "organization_id" INTEGER,
    "parent_id" INTEGER,
    "last_login_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "users_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_users" ("avatar", "created_at", "id", "nickname", "openid", "phone", "role", "status", "updated_at") SELECT "avatar", "created_at", "id", "nickname", "openid", "phone", "role", "status", "updated_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_openid_key" ON "users"("openid");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "users_unionid_key" ON "users"("unionid");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "teacher_course_grants_user_id_course_id_key" ON "teacher_course_grants"("user_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_incomes_user_id_course_id_date_key" ON "session_incomes"("user_id", "course_id", "date");
