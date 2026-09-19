import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import {
  getPaginationParams,
  buildPaginationResult,
} from '@/common/utils/pagination.util';

@Injectable()
export class OrderService {
  constructor(private prisma: PrismaService) {}

  // 创建订单
  async createOrder(userId: number, courseId: number) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId, status: 1 },
    });

    if (!course) {
      throw new NotFoundException('课程不存在或已下架');
    }

    // 免费课程直接发放
    if (course.isFree || course.price === 0) {
      await this.grantCourse(userId, courseId, null);
      return { isFree: true, message: '免费课程已开通' };
    }

    // 检查是否已购买
    const existing = await this.prisma.userCourse.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });

    if (existing) {
      throw new BadRequestException('您已购买该课程');
    }

    // 生成订单号
    const orderNo = `HTC${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const order = await this.prisma.order.create({
      data: {
        orderNo,
        userId,
        courseId,
        amount: course.price,
        status: 'pending',
      },
    });

    return order;
  }

  // 订单列表
  async getOrderList(userId: number, page: number, pageSize: number, status?: string) {
    const { skip } = getPaginationParams({ page, pageSize });
    const where: any = { userId };
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          course: {
            select: { id: true, title: true, cover: true },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return buildPaginationResult(list, total, page, pageSize);
  }

  // 订单详情
  async getOrderDetail(orderId: number, userId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        course: true,
      },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    return order;
  }

  // 发放课程
  async grantCourse(userId: number, courseId: number, orderId: number | null) {
    await this.prisma.userCourse.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: {},
      create: {
        userId,
        courseId,
        orderId,
      },
    });

    // 增加课程学习人数
    await this.prisma.course.update({
      where: { id: courseId },
      data: { studentCount: { increment: 1 } },
    });
  }
}
