import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  getPaginationParams,
  buildPaginationResult,
} from '@/common/utils/pagination.util';
import { CourseListDto } from './dto/course-list.dto';
import { StaffService } from '../staff/staff.service';

const courseCardSelect = {
  id: true,
  title: true,
  description: true,
  cover: true,
  price: true,
  originalPrice: true,
  rating: true,
  studentCount: true,
  lessonCount: true,
  duration: true,
  level: true,
  isFree: true,
  isHot: true,
  isRecommend: true,
  school: true,
  classroom: true,
  gradeLabel: true,
  weekday: true,
  startTime: true,
  endTime: true,
  seats: true,
  teacherId: true,
  category: { select: { id: true, name: true } },
  teacher: { select: { id: true, nickname: true } },
};

@Injectable()
export class CourseService {
  constructor(
    private prisma: PrismaService,
    private staffService: StaffService,
  ) {}

  async getCourseList(query: CourseListDto, userId?: number) {
    const { page, pageSize, skip } = getPaginationParams(query);
    const where: any = { status: 1 };
    const gate = await this.teacherGate(userId);

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.keyword) {
      where.OR = [
        { title: { contains: query.keyword } },
        { description: { contains: query.keyword } },
        { school: { contains: query.keyword } },
        { gradeLabel: { contains: query.keyword } },
      ];
    }
    if (query.level) where.level = query.level;

    const orderBy: any = {};
    if (query.sortBy === 'hot') orderBy.studentCount = 'desc';
    else if (query.sortBy === 'new') orderBy.createdAt = 'desc';
    else if (query.sortBy === 'rating') orderBy.rating = 'desc';
    else orderBy.id = 'desc';

    const [list, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        select: courseCardSelect,
      }),
      this.prisma.course.count({ where }),
    ]);

    return buildPaginationResult(
      list.map((item) => this.present(item, gate.certified, userId, gate.contracted)),
      total,
      page,
      pageSize,
    );
  }

  async getCourseDetail(id: number, userId?: number) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        teacher: { select: { id: true, nickname: true } },
        lessons: {
          where: { status: 1 },
          orderBy: { sort: 'asc' },
          select: { id: true, title: true, duration: true, sort: true, isFree: true },
        },
      },
    });
    if (!course) throw new NotFoundException('课程不存在');

    let isBought = false;
    if (userId) {
      const userCourse = await this.prisma.userCourse.findUnique({
        where: { userId_courseId: { userId, courseId: id } },
      });
      isBought = !!userCourse;
    }

    const gate = await this.teacherGate(userId);
    return { ...this.present(course, gate.certified, userId, gate.contracted), isBought, lessons: course.lessons };
  }

  async getRecommendCourses(limit = 6, userId?: number) {
    const gate = await this.teacherGate(userId);
    const list = await this.prisma.course.findMany({
      where: { status: 1, isRecommend: true },
      take: limit,
      orderBy: { id: 'desc' },
      select: courseCardSelect,
    });
    return list.map((item) => this.present(item, gate.certified, userId, gate.contracted));
  }

  async getHotCourses(limit = 10, userId?: number) {
    const gate = await this.teacherGate(userId);
    const list = await this.prisma.course.findMany({
      where: { status: 1 },
      take: limit,
      orderBy: { studentCount: 'desc' },
      select: courseCardSelect,
    });
    return list.map((item) => this.present(item, gate.certified, userId, gate.contracted));
  }

  async getToday(userId?: number) {
    const date = this.todayKey();
    const weekday = this.todayWeekday();
    const gate = await this.teacherGate(userId);
    const sessions = await this.prisma.courseSession.findMany({
      where: { date },
      orderBy: { startTime: 'asc' },
      include: { course: { select: courseCardSelect } },
    });
    const source = sessions.length
      ? sessions
          .filter((item) => item.status === 'scheduled' || item.status === 'observe')
          .map((item) => this.present({
            ...item.course,
            startTime: item.startTime,
            endTime: item.endTime,
            sessionStatus: item.status,
            sessionNote: item.note,
          }, gate.certified, userId, gate.contracted))
      : (await this.prisma.course.findMany({
          where: { status: 1, weekday },
          orderBy: { startTime: 'asc' },
          select: courseCardSelect,
        })).map((item) => this.present(item, gate.certified, userId, gate.contracted));
    const mine = source.filter((item) => item.isMine);
    const next = mine[0] || source[0] || null;
    let checkedIn = false;
    if (userId && next) {
      const row = await this.prisma.checkIn.findUnique({
        where: {
          userId_courseId_date: {
            userId,
            courseId: next.id,
            date: this.todayKey(),
          },
        },
      });
      checkedIn = !!row;
    }
    return {
      weekday,
      certified: gate.certified,
      total: source.length,
      courses: source,
      next,
      checkedIn,
    };
  }

  async getSchedule(userId?: number) {
    const gate = await this.teacherGate(userId);
    const courses = await this.prisma.course.findMany({
      where: {
        status: 1,
        weekday: { not: null },
        ...(userId ? { teacherId: userId } : {}),
      },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
      select: courseCardSelect,
    });
    return courses.map((item) => this.present(item, gate.certified, userId, gate.contracted));
  }

  async grabCourse(courseId: number, userId: number) {
    const gate = await this.teacherGate(userId);
    if (!gate.certified) throw new ForbiddenException('认证通过后才能抢课');
    if (!gate.contracted) throw new ForbiddenException('签订合同后才能抢课');
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course || course.status !== 1) throw new NotFoundException('课程不存在或已下架');
    if (course.teacherId) throw new BadRequestException('该课程已安排老师');
    await this.staffService.ensureGrant(userId, courseId);
    return this.prisma.course.update({
      where: { id: courseId },
      data: { teacherId: userId, seats: 0 },
      select: { id: true, title: true, teacherId: true },
    });
  }

  async checkIn(courseId: number, userId: number) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('课程不存在');
    if (course.teacherId !== userId) throw new ForbiddenException('只有授课老师可以签到');

    const date = this.todayKey();
    const record = await this.prisma.checkIn.upsert({
      where: { userId_courseId_date: { userId, courseId, date } },
      update: {},
      create: { userId, courseId, date, place: course.school },
    });
    await this.staffService.settle(userId, courseId, date);
    return record;
  }

  async getCheckIn(courseId: number, userId: number) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: courseCardSelect,
    });
    if (!course) throw new NotFoundException('课程不存在');
    const record = await this.prisma.checkIn.findUnique({
      where: {
        userId_courseId_date: { userId, courseId, date: this.todayKey() },
      },
    });
    const gate = await this.teacherGate(userId);
    return {
      course: this.present(course, gate.certified, userId, gate.contracted),
      checkedIn: !!record,
      checkInAt: record?.createdAt || null,
      place: record?.place || course.school,
    };
  }

  async getMyCourses(userId: number, page: number, pageSize: number) {
    const { skip } = getPaginationParams({ page, pageSize });
    const [list, total] = await Promise.all([
      this.prisma.userCourse.findMany({
        where: { userId },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          course: { select: { id: true, title: true, cover: true, lessonCount: true } },
        },
      }),
      this.prisma.userCourse.count({ where: { userId } }),
    ]);
    return buildPaginationResult(
      list.map((item) => ({
        ...item.course,
        progress: item.progress,
        lastLearnAt: item.lastLearnAt,
      })),
      total,
      page,
      pageSize,
    );
  }

  private async teacherGate(userId?: number) {
    if (!userId) return { certified: false, contracted: false };
    const cert = await this.prisma.teacherCert.findUnique({
      where: { userId },
      select: { status: true, contractStatus: true },
    });
    const certified = cert?.status === 'approved';
    return { certified, contracted: certified && cert?.contractStatus === 'signed' };
  }

  private present(course: any, certified: boolean, userId?: number, contracted = false) {
    const result = {
      ...course,
      canSeePrice: false,
      certified,
      contractSigned: contracted,
      canGrab: contracted && !course.teacherId && course.seats > 0,
      isMine: !!userId && course.teacherId === userId,
      teacherName: course.teacher?.nickname || '',
    };
    delete result.price;
    delete result.originalPrice;
    delete result.sessionFee;
    return result;
  }

  private todayWeekday() {
    const day = new Date().getDay();
    return day === 0 ? 7 : day;
  }

  private todayKey() {
    const date = new Date();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
