import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';

@Injectable()
export class LessonService {
  constructor(private prisma: PrismaService) {}

  // 获取课时详情
  async getLessonDetail(lessonId: number, userId: number) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            isFree: true,
            price: true,
          },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException('课时不存在');
    }

    // 检查权限：免费课时或已购买课程
    const canWatch = lesson.isFree || lesson.course.isFree;
    if (!canWatch) {
      const userCourse = await this.prisma.userCourse.findUnique({
        where: { userId_courseId: { userId, courseId: lesson.courseId } },
      });
      if (!userCourse) {
        throw new ForbiddenException('请先购买课程');
      }
    }

    // 获取学习进度
    const progress = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });

    return {
      ...lesson,
      progress: progress?.progress || 0,
      isCompleted: progress?.isCompleted || false,
    };
  }

  // 更新学习进度
  async updateProgress(
    lessonId: number,
    userId: number,
    progress: number,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });

    if (!lesson) {
      throw new NotFoundException('课时不存在');
    }

    const isCompleted = lesson.duration > 0 && progress >= lesson.duration * 0.9;

    const result = await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: {
        progress,
        isCompleted,
        lastWatchAt: new Date(),
      },
      create: {
        userId,
        lessonId,
        progress,
        isCompleted,
      },
    });

    // 更新用户课程总进度（异步）
    this.updateCourseProgress(userId, lesson.courseId);

    return result;
  }

  // 更新课程总进度
  private async updateCourseProgress(userId: number, courseId: number) {
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId, status: 1 },
      select: { id: true },
    });

    const completedCount = await this.prisma.lessonProgress.count({
      where: {
        userId,
        lessonId: { in: lessons.map((l) => l.id) },
        isCompleted: true,
      },
    });

    const progress = lessons.length > 0
      ? Math.round((completedCount / lessons.length) * 100)
      : 0;

    await this.prisma.userCourse.update({
      where: { userId_courseId: { userId, courseId } },
      data: {
        progress,
        lastLearnAt: new Date(),
      },
    }).catch(() => {});
  }
}
