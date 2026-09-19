import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  getPaginationParams,
  buildPaginationResult,
} from '@/common/utils/pagination.util';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentService {
  constructor(private prisma: PrismaService) {}

  // 获取课程评论列表
  async getCommentList(courseId: number, page: number, pageSize: number) {
    const { skip } = getPaginationParams({ page, pageSize });

    const [list, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { courseId, status: 1 },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              avatar: true,
            },
          },
        },
      }),
      this.prisma.comment.count({ where: { courseId, status: 1 } }),
    ]);

    const processedList = list.map((item) => ({
      ...item,
      images: item.images ? JSON.parse(item.images) : [],
      user: item.isAnonymous
        ? { nickname: '匿名用户', avatar: '' }
        : item.user,
    }));

    return buildPaginationResult(processedList, total, page, pageSize);
  }

  // 发表评论
  async createComment(userId: number, dto: CreateCommentDto) {
    // 检查是否已购买课程
    const userCourse = await this.prisma.userCourse.findUnique({
      where: { userId_courseId: { userId, courseId: dto.courseId } },
    });

    if (!userCourse) {
      throw new BadRequestException('请先购买课程再评价');
    }

    // 检查是否已评论过
    const existing = await this.prisma.comment.findFirst({
      where: { userId, courseId: dto.courseId },
    });

    if (existing) {
      throw new BadRequestException('您已评价过该课程');
    }

    const comment = await this.prisma.comment.create({
      data: {
        userId,
        courseId: dto.courseId,
        rating: dto.rating,
        content: dto.content,
        images: dto.images ? JSON.stringify(dto.images) : null,
        isAnonymous: dto.isAnonymous || false,
      },
    });

    // 更新课程评分
    this.updateCourseRating(dto.courseId);

    return comment;
  }

  // 更新课程评分
  private async updateCourseRating(courseId: number) {
    const comments = await this.prisma.comment.findMany({
      where: { courseId, status: 1 },
      select: { rating: true },
    });

    if (comments.length > 0) {
      const avgRating =
        comments.reduce((sum, c) => sum + c.rating, 0) / comments.length;

      await this.prisma.course.update({
        where: { id: courseId },
        data: {
          rating: Math.round(avgRating * 10) / 10,
          reviewCount: comments.length,
        },
      });
    }
  }
}
