import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { buildPaginationResult, getPaginationParams } from '@/common/utils/pagination.util';
import { calculateFee, teacherFeeView, FeeQuote } from './fee';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async quote(userId: number, courseId: number, override: any = {}): Promise<FeeQuote & { organizationName: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!user || !course) throw new NotFoundException('教师或课程不存在');
    const grant = await this.prisma.teacherCourseGrant.findUnique({ where: { userId_courseId: { userId, courseId } } });
    const org = user.organization;
    const hasOrg = !!org && org.status === 1;
    const base = this.pickNumber(override.baseFee, grant?.baseFee, course.sessionFee);
    const mode = override.mode !== undefined ? override.mode : (grant?.mode || (hasOrg ? org.commissionMode : null));
    const value = override.value !== undefined ? override.value : (grant?.value ?? (hasOrg ? org.commissionValue : null));
    const visibility = override.visibility || grant?.visibility || org?.feeVisibility || 'final';
    return { ...calculateFee({ base, hasOrg, mode, value, visibility }), organizationName: org?.name || null };
  }

  preview(data: any) {
    const hasOrg = !!data.hasOrg;
    return calculateFee({
      base: data.baseFee === '' || data.baseFee == null ? null : Number(data.baseFee),
      hasOrg,
      mode: hasOrg ? data.mode : null,
      value: hasOrg ? Number(data.value || 0) : null,
      visibility: data.visibility || 'final',
    });
  }

  async settle(userId: number, courseId: number, date: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const quote = await this.quote(userId, courseId);
    return this.prisma.sessionIncome.upsert({
      where: { userId_courseId_date: { userId, courseId, date } },
      update: this.incomeData(quote, user?.organizationId),
      create: { userId, courseId, date, organizationId: user?.organizationId || null, ...this.incomeData(quote, user?.organizationId) },
    });
  }

  async myCourses(userId: number) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (cert?.status !== 'approved') return { certified: false, list: [] };
    const grants = await this.prisma.teacherCourseGrant.findMany({
      where: { userId },
      include: { course: true },
      orderBy: { id: 'desc' },
    });
    const list = [];
    for (const grant of grants) {
      const quote = await this.quote(userId, grant.courseId);
      list.push({
        id: grant.course.id,
        title: grant.course.title,
        school: grant.course.school,
        classroom: grant.course.classroom,
        gradeLabel: grant.course.gradeLabel,
        startTime: grant.course.startTime,
        endTime: grant.course.endTime,
        weekday: grant.course.weekday,
        ...teacherFeeView(quote),
      });
    }
    return { certified: true, list };
  }

  async mySummary(userId: number) {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [total, monthCount, courses] = await Promise.all([
      this.prisma.checkIn.count({ where: { userId } }),
      this.prisma.checkIn.count({ where: { userId, date: { startsWith: month } } }),
      this.prisma.course.findMany({ where: { teacherId: userId }, select: { id: true } }),
    ]);
    const ids = courses.map((item) => item.id);
    let rating: number | null = null;
    if (ids.length) {
      const agg = await this.prisma.comment.aggregate({
        where: { courseId: { in: ids }, status: 1 },
        _avg: { rating: true },
        _count: { rating: true },
      });
      if (agg._count.rating) rating = Math.round((agg._avg.rating || 0) * 10) / 10;
    }
    return { total, month: monthCount, rating };
  }

  async myIncomes(userId: number) {
    const rows = await this.prisma.sessionIncome.findMany({
      where: { userId },
      include: { course: { select: { title: true } } },
      orderBy: { date: 'desc' },
    });
    return rows.map((row) => {
      const showFee = row.visibility !== 'hidden' && row.teacherFee != null;
      return {
        id: row.id,
        title: row.course.title,
        date: row.date,
        status: row.status,
        showFee,
        teacherFee: showFee ? row.teacherFee : null,
      };
    });
  }

  async ensureGrant(userId: number, courseId: number) {
    await this.prisma.teacherCourseGrant.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: {},
      create: { userId, courseId },
    });
  }

  async people(query: any) {
    const where: any = {};
    if (query.keyword) {
      where.OR = [
        { nickname: { contains: query.keyword } },
        { phone: { contains: query.keyword } },
        { teacherCert: { realName: { contains: query.keyword } } },
      ];
    }
    if (query.status === '0' || query.status === '1') where.status = Number(query.status);
    if (query.organizationId === '0') where.organizationId = null;
    else if (query.organizationId) where.organizationId = Number(query.organizationId);
    if (query.hasParent === '1') where.parentId = { not: null };
    if (query.hasParent === '0') where.parentId = null;
    if (query.cert === 'none') where.teacherCert = { is: null };
    else if (query.cert) where.teacherCert = { status: query.cert };
    const pagination = getPaginationParams({ page: Number(query.page), pageSize: Number(query.pageSize) || 10 });
    const [list, total, all, wechat, certified, pending, frozen] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
        include: this.userCard(),
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { OR: [{ teacherCert: { is: null } }, { teacherCert: { status: { not: 'approved' } } }] },
      }),
      this.prisma.teacherCert.count({ where: { status: 'approved' } }),
      this.prisma.teacherCert.count({ where: { status: 'pending' } }),
      this.prisma.user.count({ where: { status: 0 } }),
    ]);
    return {
      stats: { all, wechat, certified, pending, frozen },
      ...buildPaginationResult(list.map((item) => this.presentUser(item)), total, pagination.page, pagination.pageSize),
    };
  }

  async faculty() {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const list = await this.prisma.user.findMany({
      where: { teacherCert: { isNot: null } },
      orderBy: { id: 'desc' },
      include: this.userCard(),
    });
    return {
      stats: {
        certified: list.filter((item) => item.teacherCert?.status === 'approved').length,
        pending: list.filter((item) => item.teacherCert?.status === 'pending').length,
        monthNew: list.filter((item) => item.teacherCert && item.teacherCert.createdAt >= start).length,
        org: list.filter((item) => item.organizationId && item.teacherCert?.status === 'approved').length,
        independent: list.filter((item) => !item.organizationId && item.teacherCert?.status === 'approved').length,
      },
      list: list.map((item) => this.presentUser(item)),
    };
  }

  async teacherDetail(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: this.userCard() });
    if (!user) throw new NotFoundException('用户不存在');
    const [grants, incomes, orgs, teachers] = await Promise.all([
      this.prisma.teacherCourseGrant.findMany({ where: { userId: id }, include: { course: true } }),
      this.prisma.sessionIncome.findMany({ where: { userId: id }, include: { course: { select: { title: true, school: true } } }, orderBy: { date: 'desc' } }),
      this.prisma.organization.findMany({ where: { status: 1 }, select: { id: true, name: true } }),
      this.prisma.user.findMany({
        where: { teacherCert: { status: 'approved' }, NOT: { id } },
        select: { id: true, nickname: true, teacherCert: { select: { realName: true } } },
      }),
    ]);
    const grantViews = [];
    for (const grant of grants) {
      grantViews.push({ id: grant.id, courseId: grant.courseId, title: grant.course.title, quote: await this.quote(id, grant.courseId) });
    }
    return {
      ...this.presentUser(user),
      grants: grantViews,
      incomes,
      orgs,
      teachers: teachers.map((item) => ({ id: item.id, name: item.teacherCert?.realName || item.nickname })),
    };
  }

  async setOrg(userId: number, organizationId: number | null) {
    if (organizationId) {
      const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
      if (!org) throw new NotFoundException('机构不存在');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { organizationId } });
    return this.teacherDetail(userId);
  }

  async setParent(userId: number, parentId: number | null) {
    if (parentId) {
      if (parentId === userId) throw new BadRequestException('不能把自己设为上级');
      const parent = await this.prisma.teacherCert.findUnique({ where: { userId: parentId } });
      if (parent?.status !== 'approved') throw new BadRequestException('上级必须是认证教师');
      await this.assertNoCycle(userId, parentId);
    }
    await this.prisma.user.update({ where: { id: userId }, data: { parentId } });
    return { id: userId, parentId };
  }

  async freeze(userId: number, frozen: boolean) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    await this.prisma.user.update({ where: { id: userId }, data: { status: frozen ? 0 : 1 } });
    if (cert) {
      await this.prisma.teacherCert.update({
        where: { userId },
        data: { status: frozen ? 'frozen' : (cert.status === 'frozen' ? 'approved' : cert.status) },
      });
    }
    return { id: userId, status: frozen ? 0 : 1 };
  }

  async certs() {
    const semester = await this.openSemester();
    const list = await this.prisma.teacherCert.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { user: { select: { id: true, nickname: true, avatar: true, phone: true, status: true } } },
    });
    return list.map((item) => ({
      ...item,
      semesterName: semester?.name || '',
      clearanceDue: item.status === 'approved' && !!semester && item.clearanceSemesterId !== semester.id && item.clearanceStatus !== 'pending',
    }));
  }

  async review(userId: number, action: string, reason?: string) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (!cert) throw new NotFoundException('还没有认证申请');
    const semester = await this.openSemester();
    if (action === 'approveClearance') {
      if (cert.clearanceStatus !== 'pending') throw new BadRequestException('没有待审核的无犯罪证明');
      await this.prisma.teacherCert.update({
        where: { userId },
        data: { clearanceStatus: 'approved', clearanceSemesterId: semester?.id || cert.clearanceSemesterId },
      });
      return { status: 'approved' };
    }
    if (action === 'approve') {
      const teacherNo = cert.teacherNo || `TEA-${new Date().getFullYear()}${String(userId).padStart(4, '0')}`;
      await this.prisma.teacherCert.update({
        where: { userId },
        data: {
          status: 'approved',
          teacherNo,
          rejectReason: null,
          clearanceStatus: 'approved',
          clearanceSemesterId: semester?.id || null,
        },
      });
      await this.prisma.user.update({ where: { id: userId }, data: { role: 'teacher', status: 1 } });
      return { status: 'approved' };
    }
    if (action === 'reject') {
      const clearanceOnly = cert.status === 'approved' && cert.clearanceStatus === 'pending';
      await this.prisma.teacherCert.update({
        where: { userId },
        data: clearanceOnly
          ? { clearanceStatus: 'rejected', rejectReason: reason || '无犯罪证明未通过' }
          : { status: 'rejected', rejectReason: reason || '资料不完整' },
      });
      return { status: clearanceOnly ? 'approved' : 'rejected' };
    }
    throw new BadRequestException('未知审核操作');
  }

  private async openSemester() {
    const now = new Date();
    const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
    return this.prisma.semester.findFirst({
      where: { status: 1, startDate: { lte: today }, endDate: { gte: today } },
      orderBy: { id: 'desc' },
    });
  }

  async orgs() {
    const list = await this.prisma.organization.findMany({
      orderBy: { id: 'desc' },
      include: { _count: { select: { teachers: true } } },
    });
    return list;
  }

  async saveOrg(data: any, id?: number) {
    if (!data.name?.trim()) throw new BadRequestException('请填写机构名称');
    const payload = {
      name: data.name.trim(),
      logo: data.logo || null,
      contactName: data.contactName || null,
      phone: data.phone || null,
      address: data.address || null,
      intro: data.intro || null,
      status: Number(data.status ?? 1) === 0 ? 0 : 1,
      feeVisibility: ['full', 'final', 'hidden'].includes(data.feeVisibility) ? data.feeVisibility : 'final',
      commissionMode: data.commissionMode === 'fixed' ? 'fixed' : 'percent',
      commissionValue: Number(data.commissionValue || 0),
      corpName: this.text(data.corpName),
      taxNo: this.text(data.taxNo)?.toUpperCase() || null,
      bankName: this.text(data.bankName),
      bankAccount: this.text(data.bankAccount)?.replace(/[\s\-]/g, '') || null,
      corpAddress: this.text(data.corpAddress),
      corpPhone: this.text(data.corpPhone),
      corpRaw: this.text(data.corpRaw),
    };
    return id
      ? this.prisma.organization.update({ where: { id }, data: payload })
      : this.prisma.organization.create({ data: payload });
  }

  async orgDetail(id: number) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { teachers: { include: { teacherCert: true } } },
    });
    if (!org) throw new NotFoundException('机构不存在');
    const income = await this.prisma.sessionIncome.aggregate({
      where: { organizationId: id },
      _sum: { commission: true },
    });
    return { ...org, commissionTotal: income._sum.commission || 0 };
  }

  async saveGrant(userId: number, data: any) {
    const courseId = Number(data.courseId);
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('课程不存在');
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (cert?.status !== 'approved') throw new BadRequestException('只有认证教师可以授权课程');
    if (data.primary && cert?.contractStatus !== 'signed') {
      throw new BadRequestException('该老师尚未签订合同，不能安排课程');
    }
    await this.prisma.teacherCourseGrant.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: {
        baseFee: this.nullableNumber(data.baseFee),
        mode: data.mode || null,
        value: data.value == null || data.value === '' ? null : Number(data.value),
        visibility: data.visibility || null,
      },
      create: {
        userId,
        courseId,
        baseFee: this.nullableNumber(data.baseFee),
        mode: data.mode || null,
        value: data.value == null || data.value === '' ? null : Number(data.value),
        visibility: data.visibility || null,
      },
    });
    if (data.primary) {
      await this.prisma.course.update({ where: { id: courseId }, data: { teacherId: userId, seats: 0 } });
    }
    return this.quote(userId, courseId);
  }

  async incomes() {
    return this.prisma.sessionIncome.findMany({
      orderBy: { date: 'desc' },
      take: 100,
      include: {
        course: { select: { title: true, school: true } },
        user: { select: { id: true, nickname: true, teacherCert: { select: { realName: true } } } },
      },
    });
  }

  private incomeData(quote: FeeQuote, organizationId?: number | null) {
    if (!quote.configured) {
      return { baseFee: null, commission: null, teacherFee: null, visibility: quote.visibility, status: 'unconfigured', organizationId: organizationId || null };
    }
    return {
      baseFee: quote.baseFee,
      commission: quote.commission,
      teacherFee: quote.teacherFee,
      visibility: quote.visibility,
      status: 'pending',
      organizationId: organizationId || null,
    };
  }

  private async assertNoCycle(userId: number, parentId: number) {
    const seen = new Set<number>([userId]);
    let cursor: number | null = parentId;
    while (cursor) {
      if (seen.has(cursor)) throw new BadRequestException('不能形成循环上级');
      seen.add(cursor);
      const row: { parentId: number | null } | null = await this.prisma.user.findUnique({ where: { id: cursor }, select: { parentId: true } });
      cursor = row?.parentId || null;
    }
  }

  private userCard() {
    return {
      teacherCert: true,
      organization: { select: { id: true, name: true } },
      parent: { select: { id: true, nickname: true, teacherCert: { select: { realName: true } } } },
      _count: { select: { grants: true, teachingCourses: true } },
    } as const;
  }

  private presentUser(item: any) {
    const cert = item.teacherCert;
    return {
      id: item.id,
      avatar: item.avatar,
      nickname: item.nickname,
      phone: item.phone,
      status: item.status,
      role: item.role,
      createdAt: item.createdAt,
      lastLoginAt: item.lastLoginAt,
      realName: cert?.realName || '',
      certStatus: cert?.status || 'none',
      contractSigned: cert?.contractStatus === 'signed',
      teacherNo: cert?.teacherNo || '',
      gender: cert?.gender || item.gender || '',
      bio: cert?.bio || '',
      skills: cert?.skills || '',
      rejectReason: cert?.rejectReason || '',
      idCard: cert?.idCard || '',
      diploma: cert?.diploma || '',
      certificate: cert?.certificate || '',
      organization: item.organization || null,
      parent: item.parent ? { id: item.parent.id, name: item.parent.teacherCert?.realName || item.parent.nickname } : null,
      grantCount: item._count?.grants || 0,
      taughtCount: item._count?.teachingCourses || 0,
    };
  }

  private text(value: any) {
    const text = String(value ?? '').trim();
    return text || null;
  }

  private pickNumber(...values: any[]) {
    for (const value of values) {
      if (value !== undefined && value !== null && value !== '') return Number(value);
    }
    return null;
  }

  private nullableNumber(value: any) {
    if (value === undefined || value === null || value === '') return null;
    return Number(value);
  }
}
