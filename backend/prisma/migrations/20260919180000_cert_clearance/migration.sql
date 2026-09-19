-- 身份证反面，以及无犯罪证明按学期审核
ALTER TABLE "teacher_certs" ADD COLUMN "id_card_back" TEXT;
ALTER TABLE "teacher_certs" ADD COLUMN "clearance_status" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "teacher_certs" ADD COLUMN "clearance_semester_id" INTEGER;
