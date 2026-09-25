import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  getPaginationParams,
  buildPaginationResult,
} from '@/common/utils/pagination.util';
import { CourseListDto } from './dto/course-list.dto';
import { StaffService } from '../staff/staff.service';
import { ScheduleService } from '../schedule/schedule.service';

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
  sessionFee: true,
  grabAt: true,
  teacherId: true,
  activeSemesterId: true,
  category: { select: { id: true, name: true } },
  teacher: { select: { id: true, nickname: true } },
};

@Injectable()
export class CourseService {
  constructor(
    private prisma: PrismaService,
    private staffService: StaffService,
    private scheduleService: ScheduleService,
  ) {}

  private async activeScope() {
    const open = await this.scheduleService.currentOpenSemester();
    if (!open) return {};
    return {
      OR: [
        { activeSemesterId: open.id },
        { activeSemesterId: null },
      ],
    };
  }

  async getCourseList(query: CourseListDto, userId?: number) {
    const { page, pageSize, skip } = getPaginationParams(query);
    const where: any = { status: 1, ...(await this.activeScope()) };
    const gate = await this.teacherGate(userId);

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.keyword) {
      where.AND = [
        {
          OR: [
            { title: { contains: query.keyword } },
            { description: { contains: query.keyword } },
            { school: { contains: query.keyword } },
            { gradeLabel: { contains: query.keyword } },
          ],
        },
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
    const view = this.present(course, gate.certified, userId, gate.contracted);
    if (gate.certified && !course.teacherId) {
      const fee = course.sessionFee != null ? Number(course.sessionFee) : null;
      view.showPrice = true;
      view.coursePrice = fee != null ? fee : Number(course.price || 0);
      view.priceLabel = fee != null ? '课时费' : '课程价格';
    }
    return { ...view, isBought, lessons: course.lessons };
  }

  async getRecommendCourses(limit = 6, userId?: number) {
    const gate = await this.teacherGate(userId);
    const list = await this.prisma.course.findMany({
      where: { status: 1, teacherId: null, ...(await this.activeScope()) },
      take: limit,
      orderBy: [{ isRecommend: 'desc' }, { seats: 'desc' }, { id: 'desc' }],
      select: courseCardSelect,
    });
    return list.map((item) => this.present(item, gate.certified, userId, gate.contracted));
  }

  async getHotCourses(limit = 10, userId?: number) {
    const gate = await this.teacherGate(userId);
    const list = await this.prisma.course.findMany({
      where: { status: 1, ...(await this.activeScope()) },
      take: limit,
      orderBy: { studentCount: 'desc' },
      select: courseCardSelect,
    });
    return list.map((item) => this.present(item, gate.certified, userId, gate.contracted));
  }

  async getToday(userId?: number) {
    await this.scheduleService.completeDueSessions();
    const date = this.todayKey();
    const weekday = this.todayWeekday();
    const gate = await this.teacherGate(userId);
    const open = await this.scheduleService.currentOpenSemester();
    const sessions = await this.prisma.courseSession.findMany({
      where: {
        date,
        ...(open ? { semesterId: open.id } : {}),
      },
      orderBy: { startTime: 'asc' },
      include: { course: { select: courseCardSelect } },
    });
    const source = sessions.length
      ? sessions
          .filter((item) => ['scheduled', 'observe', 'completed'].includes(item.status))
          .map((item) => this.present({
            ...item.course,
            startTime: item.startTime,
            endTime: item.endTime,
            sessionStatus: item.status,
            sessionNote: item.note,
            sessionDone: item.status === 'completed' || item.status === 'observe',
          }, gate.certified, userId, gate.contracted))
      : (await this.prisma.course.findMany({
          where: { status: 1, weekday, ...(await this.activeScope()) },
          orderBy: { startTime: 'asc' },
          select: courseCardSelect,
        })).map((item) => this.present(item, gate.certified, userId, gate.contracted));
    const mine = source.filter((item) => item.isMine);
    const next = mine[0] || source[0] || null;
    const done = !!(next && (next as any).sessionDone);
    return {
      weekday,
      certified: gate.certified,
      total: source.length,
      courses: source,
      next,
      checkedIn: done,
      sessionDone: done,
    };
  }

  async getSchedule(userId?: number) {
    const gate = await this.teacherGate(userId);
    const courses = await this.prisma.course.findMany({
      where: {
        status: 1,
        weekday: { not: null },
        ...(await this.activeScope()),
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
    if (course.grabAt && course.grabAt.getTime() > Date.now()) throw new BadRequestException('还没到开抢时间');
    const open = await this.scheduleService.currentOpenSemester();
    if (open && course.activeSemesterId && course.activeSemesterId !== open.id) {
      throw new BadRequestException('该课程属于其他学期，暂不可抢');
    }
    await this.staffService.ensureGrant(userId, courseId);
    const updated = await this.prisma.course.update({
      where: { id: courseId },
      data: {
        teacherId: userId,
        seats: 0,
        ...(open && !course.activeSemesterId ? { activeSemesterId: open.id } : {}),
      },
      select: { id: true, title: true, teacherId: true, activeSemesterId: true },
    });
    const semesterId = updated.activeSemesterId || open?.id;
    if (semesterId) {
      await this.scheduleService.assignTermTeacher(courseId, semesterId, userId);
    }
    return updated;
  }

  async checkIn(courseId: number, userId: number) {
    // 保留接口：特殊需确认的课次可手动补记；普通课过时已自动记为已上
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('课程不存在');
    if (course.teacherId !== userId) throw new ForbiddenException('只有授课老师可以确认上课');

    const date = this.todayKey();
    const session = await this.prisma.courseSession.findFirst({
      where: {
        courseId,
        date,
        status: { in: ['scheduled', 'completed', 'observe'] },
      },
      orderBy: { startTime: 'asc' },
    });
    if (session?.completionMode === 'exempt') {
      throw new BadRequestException('本节课已标记为不计上课');
    }
    if (session && session.status === 'scheduled') {
      await this.prisma.courseSession.update({
        where: { id: session.id },
        data: { status: 'completed', completedAt: new Date(), completionMode: 'manual' },
      });
    }
    const record = await this.prisma.checkIn.upsert({
      where: { userId_courseId_date: { userId, courseId, date } },
      update: {},
      create: { userId, courseId, date, place: course.school },
    });
    await this.staffService.settle(userId, courseId, date);
    return record;
  }

  async getCheckIn(courseId: number, userId: number) {
    await this.scheduleService.completeDueSessions();
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: courseCardSelect,
    });
    if (!course) throw new NotFoundException('课程不存在');
    const date = this.todayKey();
    const session = await this.prisma.courseSession.findFirst({
      where: { courseId, date, status: { in: ['scheduled', 'completed', 'observe'] } },
      orderBy: { startTime: 'asc' },
    });
    const record = await this.prisma.checkIn.findUnique({
      where: {
        userId_courseId_date: { userId, courseId, date },
      },
    });
    const gate = await this.teacherGate(userId);
    const done = session?.status === 'completed' || session?.status === 'observe' || !!record;
    return {
      course: this.present(course, gate.certified, userId, gate.contracted),
      checkedIn: done,
      checkInAt: session?.completedAt || record?.createdAt || null,
      place: record?.place || course.school,
      autoCompleted: session?.status === 'completed' && session?.completionMode === 'auto',
      needConfirm: session?.completionMode === 'manual' && session?.status === 'scheduled',
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
      select: { status: true, contractStatus: true, contractSemesterId: true },
    });
    const certified = cert?.status === 'approved';
    const open = await this.scheduleService.currentOpenSemester();
    const contracted = certified
      && cert?.contractStatus === 'signed'
      && !!open
      && cert.contractSemesterId === open.id;
    return { certified, contracted };
  }

  private present(course: any, certified: boolean, userId?: number, contracted = false) {
    const grabAt = course.grabAt ? new Date(course.grabAt).getTime() : 0;
    const opened = !grabAt || grabAt <= Date.now();
    const result = {
      ...course,
      grabAt,
      serverNow: Date.now(),
      showPrice: false,
      coursePrice: null,
      priceLabel: '',
      certified,
      contractSigned: contracted,
      canGrab: contracted && !course.teacherId && opened,
      openGrab: !course.teacherId,
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
