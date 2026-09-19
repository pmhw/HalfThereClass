import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { buildPaginationResult, getPaginationParams } from '@/common/utils/pagination.util';
import { getDayDetail } from 'chinese-days';
import { chinaHolidays } from './china-holidays';

const STATUS_TEXT: Record<string, string> = {
  scheduled: '上课',
  holiday: '节假日',
  cancelled: '停课',
  rescheduled: '已调出',
  observe: '听课',
};

@Injectable()
export class ScheduleService {
  constructor(private prisma: PrismaService) {}

  async listSemesters() {
    await this.closeExpired();
    const today = this.formatDate(new Date());
    const open = await this.prisma.semester.findMany({ where: { endDate: { gte: today } } });
    for (const item of open) await this.syncHolidays(item);
    const list = await this.prisma.semester.findMany({
      orderBy: [{ year: 'desc' }, { id: 'desc' }],
      include: { _count: { select: { holidays: true, sessions: true } } },
    });
    return list.map((item) => this.withTerm(item));
  }

  async semesterRecords() {
    await this.closeExpired();
    const list = await this.prisma.semester.findMany({
      orderBy: [{ year: 'desc' }, { id: 'desc' }],
      include: {
        sessions: {
          select: {
            courseId: true,
            status: true,
            kind: true,
            course: { select: { title: true } },
          },
        },
      },
    });
    return list
      .map((item) => {
        const courses = new Map<number, { courseId: number; title: string; total: number; held: number; stopped: number }>();
        const counts = { held: 0, cancelled: 0, rescheduled: 0, observe: 0, extra: 0 };
        for (const session of item.sessions) {
          if (session.status === 'scheduled' && session.kind === 'extra') counts.extra += 1;
          else if (session.status === 'cancelled') counts.cancelled += 1;
          else if (session.status === 'rescheduled') counts.rescheduled += 1;
          else if (session.status === 'observe') counts.observe += 1;
          if (session.status === 'scheduled' || session.status === 'observe') counts.held += 1;
          const row = courses.get(session.courseId) || {
            courseId: session.courseId,
            title: session.course?.title || '课程',
            total: 0,
            held: 0,
            stopped: 0,
          };
          row.total += 1;
          if (session.status === 'scheduled' || session.status === 'observe') row.held += 1;
          if (session.status === 'cancelled' || session.status === 'rescheduled') row.stopped += 1;
          courses.set(session.courseId, row);
        }
        return {
          ...this.withTerm(item),
          sessionCount: item.sessions.length,
          courseCount: courses.size,
          ...counts,
          courses: [...courses.values()].sort((a, b) => a.title.localeCompare(b.title, 'zh')),
        };
      })
      .sort((a, b) => b.year - a.year || (a.season === b.season ? 0 : a.season === 'spring' ? -1 : 1));
  }

  async saveSemester(data: any, id?: number) {
    const year = Number(data.year);
    const season = data.season === 'spring' ? 'spring' : 'autumn';
    const startDate = this.ensureDate(data.startDate);
    const endDate = this.ensureDate(data.endDate);
    if (startDate > endDate) throw new BadRequestException('结束日期不能早于开始日期');
    this.eachDate(startDate, endDate);
    const payload = {
      name: (data.name || `${year}${season === 'spring' ? '春季' : '秋季'}学期`).trim(),
      year,
      season,
      startDate,
      endDate,
      status: endDate < this.formatDate(new Date()) ? 0 : 1,
    };
    if (!year) throw new BadRequestException('请填写学年');
    if (id) {
      const exists = await this.prisma.semester.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException('学期不存在');
    }
    const saved = id
      ? await this.prisma.semester.update({ where: { id }, data: payload })
      : await this.prisma.semester.create({ data: payload });
    await this.syncHolidays(saved);
    return saved;
  }

  async deleteSemester(id: number) {
    const semester = await this.prisma.semester.findUnique({
      where: { id },
      include: { _count: { select: { sessions: true } } },
    });
    if (!semester) throw new NotFoundException('学期不存在');
    if (semester._count.sessions) throw new BadRequestException('已有课次记录，学期需要留存，不能删除');
    await this.prisma.semester.delete({ where: { id } });
    return { id };
  }

  async listHolidays(semesterId: number) {
    const semester = await this.prisma.semester.findUnique({ where: { id: semesterId } });
    if (!semester) return [];
    await this.syncHolidays(semester);
    return this.prisma.holiday.findMany({
      where: { semesterId },
      orderBy: { date: 'asc' },
    });
  }

  async saveHoliday(data: any) {
    const semesterId = Number(data.semesterId);
    const semester = await this.prisma.semester.findUnique({ where: { id: semesterId } });
    if (!semester) throw new NotFoundException('学期不存在');
    this.assertOpen(semester);
    const date = this.ensureDate(data.date);
    if (date < semester.startDate || date > semester.endDate) {
      throw new BadRequestException('节假日必须在学期起止日期内');
    }
    const name = String(data.name || '节假日').trim();
    const holiday = await this.prisma.holiday.upsert({
      where: { semesterId_date: { semesterId, date } },
      update: { name },
      create: { semesterId, date, name },
    });
    await this.prisma.courseSession.deleteMany({
      where: { semesterId, date, locked: false, source: 'generated' },
    });
    return holiday;
  }

  async deleteHoliday(id: number) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday) throw new NotFoundException('节假日不存在');
    const semester = await this.prisma.semester.findUnique({ where: { id: holiday.semesterId } });
    if (semester) this.assertOpen(semester);
    await this.prisma.holiday.delete({ where: { id } });
    return { id };
  }

  async generate(
    semesterId: number,
    courseIds?: number[],
    slots?: { weekday: number; startTime: string; endTime?: string | null }[],
    count?: number,
  ) {
    const semester = await this.prisma.semester.findUnique({ where: { id: semesterId } });
    if (!semester) throw new NotFoundException('学期不存在');
    this.assertOpen(semester);
    await this.syncHolidays(semester);
    if (!courseIds?.length) throw new BadRequestException('请选择一门课程单独生成');
    if (courseIds.length !== 1) throw new BadRequestException('一次只能生成一门课程');
    const weekly = this.normalizeSlots(slots);
    const times = Number(count);
    if (!Number.isInteger(times) || times < 1 || times > 200) {
      throw new BadRequestException('请设置生成次数，1 到 200');
    }
    const dates = this.eachDate(semester.startDate, semester.endDate);
    const holidays = await this.prisma.holiday.findMany({ where: { semesterId } });
    const holidayMap = new Map(holidays.map((item) => [item.date, item.name]));
    const courses = await this.prisma.course.findMany({ where: { status: 1, id: Number(courseIds[0]) } });
    if (!courses.length) throw new NotFoundException('课程不存在或已下架');
    const ids = courses.map((course) => course.id);
    const locked = await this.prisma.courseSession.findMany({
      where: { semesterId, courseId: { in: ids }, locked: true },
      select: { courseId: true, date: true, startTime: true },
    });
    const lockedKeys = new Set(locked.map((item) => `${item.courseId}|${item.date}|${item.startTime}`));
    await this.prisma.courseSession.deleteMany({
      where: { semesterId, courseId: { in: ids }, locked: false, source: 'generated' },
    });
    const rows = [];
    let omitted = 0;
    const course = courses[0];
    let placed = 0;
    for (const date of dates) {
      if (placed >= times) break;
      const weekday = this.weekdayOf(date);
      if (weekday >= 6) continue;
      for (const slot of weekly) {
        if (placed >= times) break;
        if (weekday !== slot.weekday) continue;
        if (holidayMap.has(date)) {
          omitted += 1;
          continue;
        }
        const key = `${course.id}|${date}|${slot.startTime}`;
        if (lockedKeys.has(key)) continue;
        rows.push({
          courseId: course.id,
          semesterId,
          date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          weekday: slot.weekday,
          kind: 'normal',
          status: 'scheduled',
          source: 'generated',
          locked: false,
          note: null,
        });
        placed += 1;
      }
    }
    if (rows.length) await this.prisma.courseSession.createMany({ data: rows });
    return {
      created: rows.length,
      requested: times,
      kept: locked.length,
      omitted,
      skipped: [],
      endDate: semester.endDate,
      season: semester.season,
    };
  }

  async listSessions(semesterId?: number, courseId?: number, page?: number, pageSize?: number, month?: string) {
    const where: any = {};
    if (semesterId) where.semesterId = semesterId;
    if (courseId) where.courseId = courseId;
    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('月份格式应为 YYYY-MM');
      const [year, mon] = month.split('-').map(Number);
      where.date = { gte: `${month}-01`, lte: this.formatDate(new Date(year, mon, 0)) };
      const list = await this.prisma.courseSession.findMany({
        where,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        include: { course: { select: { id: true, title: true, school: true } } },
      });
      return buildPaginationResult(
        list.map((item) => ({ ...item, label: this.sessionLabel(item) })),
        list.length,
        1,
        Math.max(list.length, 1),
      );
    }
    const pagination = getPaginationParams({ page, pageSize: pageSize || 12 });
    const [list, total] = await Promise.all([
      this.prisma.courseSession.findMany({
        where,
        skip: pagination.skip,
        take: pagination.pageSize,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        include: { course: { select: { id: true, title: true, school: true } } },
      }),
      this.prisma.courseSession.count({ where }),
    ]);
    return buildPaginationResult(
      list.map((item) => ({ ...item, label: this.sessionLabel(item) })),
      total,
      pagination.page,
      pagination.pageSize,
    );
  }

  async updateSession(id: number, data: { date?: string; startTime?: string; endTime?: string; status?: string; note?: string }) {
    const current = await this.prisma.courseSession.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('课次不存在');
    const semester = await this.prisma.semester.findUnique({ where: { id: current.semesterId } });
    if (semester) this.assertOpen(semester);
    const date = data.date ? this.ensureDate(data.date) : current.date;
    const startTime = String(data.startTime || current.startTime || '').slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(startTime)) throw new BadRequestException('请填写开始时间');
    const endTime = data.endTime === undefined ? current.endTime : data.endTime ? String(data.endTime).slice(0, 5) : null;
    return this.prisma.courseSession.update({
      where: { id },
      data: {
        date,
        startTime,
        endTime,
        weekday: this.weekdayOf(date),
        status: data.status || current.status,
        note: data.note === undefined ? current.note : data.note || null,
        locked: true,
        source: 'teacher',
      },
    });
  }

  async deleteSession(id: number) {
    const current = await this.prisma.courseSession.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('课次不存在');
    const semester = await this.prisma.semester.findUnique({ where: { id: current.semesterId } });
    if (semester) this.assertOpen(semester);
    await this.prisma.courseSession.delete({ where: { id } });
    return { ok: true };
  }

  async coursePlan(courseId: number) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true },
    });
    if (!course) throw new NotFoundException('课程不存在');
    const sessions = await this.prisma.courseSession.findMany({
      where: { courseId },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    const semesterIds = [...new Set(sessions.map((item) => item.semesterId))];
    const semesters = semesterIds.length
      ? await this.prisma.semester.findMany({
          where: { id: { in: semesterIds } },
          orderBy: { startDate: 'desc' },
        })
      : [];
    const holidays = semesterIds.length
      ? await this.prisma.holiday.findMany({
          where: { semesterId: { in: semesterIds } },
          orderBy: { date: 'asc' },
        })
      : [];
    return {
      course,
      scheduled: sessions.length > 0,
      semesters: semesters.map((item) => ({
        ...this.withTerm(item),
        sessionCount: sessions.filter((row) => row.semesterId === item.id).length,
      })),
      sessions: sessions.map((item) => ({ ...item, label: this.sessionLabel(item) })),
      holidays,
    };
  }

  async createCourseSession(courseId: number, data: { semesterId?: number; date?: string; startTime?: string; endTime?: string }) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('课程不存在');
    const date = this.ensureDate(data.date || '');
    const startTime = String(data.startTime || '').slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(startTime)) throw new BadRequestException('请填写开始时间');
    const endTime = data.endTime ? String(data.endTime).slice(0, 5) : null;
    if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) throw new BadRequestException('结束时间不正确');
    if (endTime && endTime <= startTime) throw new BadRequestException('结束时间要晚于开始时间');
    const semester = data.semesterId
      ? await this.prisma.semester.findUnique({ where: { id: Number(data.semesterId) } })
      : await this.semesterOf(date);
    if (!semester) throw new NotFoundException('学期不存在');
    this.assertOpen(semester);
    if (date < semester.startDate || date > semester.endDate) {
      throw new BadRequestException('日期要在学期起止范围内');
    }
    const duplicated = await this.prisma.courseSession.findFirst({
      where: { courseId, semesterId: semester.id, date, startTime },
    });
    if (duplicated) throw new BadRequestException('这一天这个时间已经有课');
    return this.prisma.courseSession.create({
      data: {
        courseId,
        semesterId: semester.id,
        date,
        startTime,
        endTime,
        weekday: this.weekdayOf(date),
        kind: 'extra',
        status: 'scheduled',
        source: 'teacher',
        locked: true,
      },
    });
  }

  async updateCourseSession(courseId: number, sessionId: number, data: { date?: string; startTime?: string; endTime?: string }) {
    const current = await this.prisma.courseSession.findUnique({ where: { id: sessionId } });
    if (!current || current.courseId !== courseId) throw new NotFoundException('课次不存在');
    return this.updateSession(sessionId, data);
  }

  async deleteCourseSession(courseId: number, sessionId: number) {
    const current = await this.prisma.courseSession.findUnique({ where: { id: sessionId } });
    if (!current || current.courseId !== courseId) throw new NotFoundException('课次不存在');
    return this.deleteSession(sessionId);
  }

  async calendar(month: string, userId?: number) {
    if (!/^\d{4}-\d{2}$/.test(month || '')) throw new BadRequestException('月份格式应为 YYYY-MM');
    const [year, mon] = month.split('-').map(Number);
    const start = `${month}-01`;
    const end = this.formatDate(new Date(year, mon, 0));
    const sessions = await this.prisma.courseSession.findMany({
      where: {
        date: { gte: start, lte: end },
        ...(userId ? { course: { teacherId: userId } } : {}),
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      include: {
        course: { select: { id: true, title: true, school: true, classroom: true, gradeLabel: true, teacherId: true } },
      },
    });
    return {
      month,
      generated: sessions.length > 0,
      sessions: sessions.map((item) => ({
        id: item.id,
        date: item.date,
        startTime: item.startTime,
        endTime: item.endTime,
        status: item.status,
        kind: item.kind,
        note: item.note,
        courseId: item.courseId,
        title: item.course.title,
        school: item.course.school,
        classroom: item.course.classroom,
        gradeLabel: item.course.gradeLabel,
        teacherId: item.course.teacherId,
        isMine: !!userId && item.course.teacherId === userId,
        label: this.sessionLabel(item),
      })),
      marks: this.monthMarks(start, end),
    };
  }

  private monthMarks(start: string, end: string) {
    const [startYear, startMonth, startDay] = start.split('-').map(Number);
    const cursor = new Date(startYear, startMonth - 1, startDay);
    const [endYear, endMonth, endDay] = end.split('-').map(Number);
    const last = new Date(endYear, endMonth - 1, endDay);
    const marks: { date: string; name: string; rest: boolean; work: boolean }[] = [];
    while (cursor <= last) {
      const date = this.formatDate(cursor);
      const detail = getDayDetail(date);
      const name = this.festivalLabel(detail.name);
      const rest = !!name && !detail.work;
      const work = !!name && detail.work;
      if (name) marks.push({ date, name, rest, work });
      cursor.setDate(cursor.getDate() + 1);
    }
    return marks;
  }

  private festivalLabel(raw: string) {
    const name = (raw || '').split(',')[1] || '';
    if (!name) return '';
    const map: Record<string, string> = {
      元旦: '元旦',
      春节: '春节',
      清明: '清明',
      劳动节: '劳动',
      端午: '端午',
      中秋: '中秋',
      国庆节: '国庆',
    };
    return map[name] || name.replace(/节$/, '').slice(0, 2);
  }

  async teaching(userId: number) {
    return this.prisma.course.findMany({
      where: { teacherId: userId, status: 1 },
      orderBy: { id: 'desc' },
      select: { id: true, title: true, school: true, weekday: true, startTime: true, endTime: true },
    });
  }

  async adjust(userId: number, data: any) {
    const course = await this.prisma.course.findUnique({ where: { id: Number(data.courseId) } });
    if (!course) throw new NotFoundException('课程不存在');
    if (course.teacherId !== userId) throw new ForbiddenException('只有这门课的任课老师可以登记');
    const type = data.type;
    if (!['reschedule', 'add', 'cancel', 'observe'].includes(type)) {
      throw new BadRequestException('请选择调课、加课、停课或听课');
    }
    const date = this.ensureDate(data.date);
    const semester = await this.semesterOf(date);
    if (type === 'add') {
      const startTime = data.startTime || course.startTime;
      const endTime = data.endTime || course.endTime;
      if (!startTime) throw new BadRequestException('请填写上课时间');
      const exists = await this.prisma.courseSession.findFirst({
        where: { courseId: course.id, date, startTime, status: { in: ['scheduled', 'observe'] } },
      });
      if (exists) throw new BadRequestException('这天这个时间已经有课');
      return this.prisma.courseSession.create({
        data: this.teacherSession(course, semester.id, date, startTime, endTime, 'extra', 'scheduled', data.note || '老师登记加课'),
      });
    }
    if (type === 'reschedule') {
      const toDate = this.ensureDate(data.toDate);
      if (toDate === date) throw new BadRequestException('调课日期不能和原日期相同');
      await this.semesterOf(toDate);
      const startTime = data.startTime || course.startTime || '00:00';
      const endTime = data.endTime || course.endTime;
      await this.markSource(course, semester.id, date, `已调至 ${toDate}`);
      const targetSemester = await this.semesterOf(toDate);
      const existing = await this.prisma.courseSession.findFirst({
        where: { courseId: course.id, date: toDate, startTime },
      });
      if (existing) {
        return this.prisma.courseSession.update({
          where: { id: existing.id },
          data: {
            status: 'scheduled',
            kind: 'makeup',
            source: 'teacher',
            locked: true,
            endTime,
            note: `由 ${date} 调入`,
          },
        });
      }
      return this.prisma.courseSession.create({
        data: this.teacherSession(course, targetSemester.id, toDate, startTime, endTime, 'makeup', 'scheduled', `由 ${date} 调入`),
      });
    }
    const status = type === 'observe' ? 'observe' : 'cancelled';
    const note = data.note || (type === 'observe' ? '老师登记听课' : '老师登记停课');
    return this.markSource(course, semester.id, date, note, status);
  }

  private async markSource(course: any, semesterId: number, date: string, note: string, status = 'rescheduled') {
    const current = await this.prisma.courseSession.findFirst({
      where: { courseId: course.id, date, kind: { not: 'extra' } },
      orderBy: { id: 'asc' },
    });
    if (current) {
      return this.prisma.courseSession.update({
        where: { id: current.id },
        data: { status, source: 'teacher', locked: true, note },
      });
    }
    return this.prisma.courseSession.create({
      data: this.teacherSession(course, semesterId, date, course.startTime || '00:00', course.endTime, 'normal', status, note),
    });
  }

  private teacherSession(course: any, semesterId: number, date: string, startTime: string, endTime: string | null, kind: string, status: string, note: string) {
    return {
      courseId: course.id,
      semesterId,
      date,
      startTime,
      endTime,
      weekday: this.weekdayOf(date),
      kind,
      status,
      source: 'teacher',
      locked: true,
      note,
    };
  }

  private async syncHolidays(semester: { id: number; startDate: string; endDate: string; status?: number }) {
    if (semester.status === 0 || semester.endDate < this.formatDate(new Date())) return;
    const days = chinaHolidays(semester.startDate, semester.endDate);
    const existing = await this.prisma.holiday.findMany({ where: { semesterId: semester.id } });
    const keep = new Set(days.map((item) => item.date));
    const removeIds = existing.filter((item) => !keep.has(item.date)).map((item) => item.id);
    if (removeIds.length) await this.prisma.holiday.deleteMany({ where: { id: { in: removeIds } } });
    for (const day of days) {
      await this.prisma.holiday.upsert({
        where: { semesterId_date: { semesterId: semester.id, date: day.date } },
        update: { name: day.name },
        create: { semesterId: semester.id, date: day.date, name: day.name },
      });
    }
    if (days.length) {
      await this.prisma.courseSession.deleteMany({
        where: {
          semesterId: semester.id,
          date: { in: days.map((item) => item.date) },
          locked: false,
          source: 'generated',
        },
      });
    }
  }

  private async closeExpired() {
    await this.prisma.semester.updateMany({
      where: { status: 1, endDate: { lt: this.formatDate(new Date()) } },
      data: { status: 0 },
    });
  }

  private assertOpen(semester: { status: number; endDate: string }) {
    if (semester.status !== 1 || semester.endDate < this.formatDate(new Date())) {
      throw new BadRequestException('学期已结束，课表记录已留存，不能再修改');
    }
  }

  private termLabel(year: number, season: string) {
    return `${String(year).slice(-2)}${season === 'spring' ? '春' : '秋'}`;
  }

  private phase(item: { startDate: string; endDate: string }) {
    const today = this.formatDate(new Date());
    if (item.endDate < today) return 'ended';
    if (item.startDate > today) return 'upcoming';
    return 'active';
  }

  private withTerm(item: {
    id: number;
    name: string;
    year: number;
    season: string;
    startDate: string;
    endDate: string;
    status: number;
    _count?: { holidays: number; sessions: number };
  }) {
    return {
      id: item.id,
      name: item.name,
      year: item.year,
      season: item.season,
      startDate: item.startDate,
      endDate: item.endDate,
      status: item.endDate < this.formatDate(new Date()) ? 0 : item.status,
      label: this.termLabel(item.year, item.season),
      phase: this.phase(item),
      _count: item._count,
    };
  }

  private async semesterOf(date: string) {
    const semester = await this.prisma.semester.findFirst({
      where: { status: 1, startDate: { lte: date }, endDate: { gte: date } },
      orderBy: { id: 'desc' },
    });
    if (!semester) throw new BadRequestException('该日期不在已配置的学期内，请先在后台设置学期');
    return semester;
  }

  private sessionLabel(item: { status: string; kind: string }) {
    if (item.status === 'scheduled' && item.kind === 'extra') return '加课';
    if (item.status === 'scheduled' && item.kind === 'makeup') return '调入';
    return STATUS_TEXT[item.status] || item.status;
  }

  private ensureDate(value: string) {
    this.parseDate(value);
    return value;
  }

  private parseDate(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) throw new BadRequestException('日期格式应为 YYYY-MM-DD');
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (this.formatDate(date) !== value) throw new BadRequestException('日期无效');
    return date;
  }

  private normalizeSlots(slots?: { weekday: number; startTime: string; endTime?: string | null }[]) {
    if (!slots?.length) throw new BadRequestException('请至少设置一个每周上课时间');
    const seen = new Set<string>();
    return slots.map((slot) => {
      const weekday = Number(slot.weekday);
      const startTime = String(slot.startTime || '').slice(0, 5);
      const endTime = slot.endTime ? String(slot.endTime).slice(0, 5) : null;
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 5) {
        throw new BadRequestException('每周上课时间请选周一到周五，周末不生成');
      }
      if (!/^\d{2}:\d{2}$/.test(startTime)) throw new BadRequestException('请填写开始时间');
      if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) throw new BadRequestException('结束时间格式不正确');
      const key = `${weekday}|${startTime}`;
      if (seen.has(key)) throw new BadRequestException('同一天的开始时间不能重复');
      seen.add(key);
      return { weekday, startTime, endTime };
    });
  }

  private weekdayOf(value: string) {
    const day = this.parseDate(value).getDay();
    return day === 0 ? 7 : day;
  }

  private eachDate(start: string, end: string) {
    const cursor = this.parseDate(start);
    const last = this.parseDate(end);
    const dates: string[] = [];
    while (cursor <= last) {
      dates.push(this.formatDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
      if (dates.length > 400) throw new BadRequestException('学期跨度不能超过 400 天');
    }
    return dates;
  }

  private formatDate(date: Date) {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
