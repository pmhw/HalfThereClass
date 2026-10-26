import { PrismaService } from '@/common/prisma/prisma.service';

/** 本学期任课老师跟随课程老师（结算优先用它）；清空老师时删掉，避免之后的课继续算给旧老师 */
export async function syncTermTeacher(
  prisma: PrismaService,
  courseId: number,
  semesterId: number | null | undefined,
  teacherId: number | null,
) {
  if (!semesterId) return;
  if (teacherId) {
    await prisma.courseTermTeacher.upsert({
      where: { courseId_semesterId: { courseId, semesterId } },
      update: { teacherId, endedAt: null, assignedAt: new Date() },
      create: { courseId, semesterId, teacherId },
    });
    return;
  }
  await prisma.courseTermTeacher.deleteMany({ where: { courseId, semesterId } });
}
