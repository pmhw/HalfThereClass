import { copyFileSync, createReadStream, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit, StreamableFile, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  buildPaginationResult,
  getPaginationParams,
} from '@/common/utils/pagination.util';
import { ADMIN_PERMISSIONS, parsePermissions } from '@/modules/admin/admin.permissions';
import {
  AGREEMENT_BODY_KEY,
  AGREEMENT_TITLE_KEY,
  DEFAULT_AGREEMENT,
} from '@/common/agreement';
import {
  CONTRACT_BODY_KEY,
  CONTRACT_TITLE_KEY,
  DEFAULT_CONTRACT,
} from '@/common/contract';

const FAIL_LIMIT = 5;
const FREEZE_MS = 15 * 60 * 1000;
const CAPTCHA_MS = 5 * 60 * 1000;
const CAPTCHA_TOLERANCE = 12;
const captchaFile = join(tmpdir(), 'halfthere-admin-captcha.json');

type CaptchaTicket = { x: number; expires: number; passed?: boolean };

function loadCaptchaStore() {
  const map = new Map<string, CaptchaTicket>();
  try {
    const raw = JSON.parse(readFileSync(captchaFile, 'utf8')) as Record<string, CaptchaTicket>;
    const now = Date.now();
    for (const [token, item] of Object.entries(raw || {})) {
      if (item && item.expires > now) map.set(token, item);
    }
  } catch {
    return map;
  }
  return map;
}

function saveCaptchaStore(map: Map<string, CaptchaTicket>) {
  const data: Record<string, CaptchaTicket> = {};
  const now = Date.now();
  for (const [token, item] of map) {
    if (item.expires > now) data[token] = item;
  }
  writeFileSync(captchaFile, JSON.stringify(data));
}

@Injectable()
export class AdminService implements OnModuleInit {
  private updating = false;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async onModuleInit() {
    await this.ensureSuper();
  }

  createCaptcha() {
    const store = loadCaptchaStore();
    const token = randomBytes(16).toString('hex');
    const x = 48 + Math.floor(Math.random() * 180);
    store.set(token, { x, expires: Date.now() + CAPTCHA_MS });
    saveCaptchaStore(store);
    return { token, width: 280, height: 150, piece: 42, image: this.captchaImage(x) };
  }

  checkCaptcha(token: string, offset: number) {
    const store = loadCaptchaStore();
    const item = store.get(String(token || ''));
    if (!item) throw new BadRequestException('滑块验证已过期，请重试');
    const ok = Math.abs(Number(offset) - item.x) <= CAPTCHA_TOLERANCE;
    if (ok) {
      item.passed = true;
      saveCaptchaStore(store);
    }
    return { ok };
  }

  async login(username: string, password: string, captchaToken: string, offset: number) {
    this.verifyCaptcha(captchaToken, offset);
    await this.ensureSuper();
    const name = String(username || '').trim();
    const admin = await this.prisma.adminAccount.findUnique({ where: { username: name } });
    if (!admin) throw new UnauthorizedException('账号或密码错误');
    if (admin.status !== 1) throw new ForbiddenException('账号已停用');
    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      throw new ForbiddenException(`账号已冻结，请于 ${this.clock(admin.lockedUntil)} 后再试`);
    }
    const matched = await bcrypt.compare(password, admin.password);
    if (!matched) {
      const failCount = admin.failCount + 1;
      if (failCount >= FAIL_LIMIT) {
        const lockedUntil = new Date(Date.now() + FREEZE_MS);
        await this.prisma.adminAccount.update({
          where: { id: admin.id },
          data: { failCount: 0, lockedUntil },
        });
        throw new ForbiddenException('密码错误次数过多，账号已冻结 15 分钟');
      }
      await this.prisma.adminAccount.update({ where: { id: admin.id }, data: { failCount } });
      throw new UnauthorizedException(`账号或密码错误，还可尝试 ${FAIL_LIMIT - failCount} 次`);
    }
    await this.prisma.adminAccount.update({
      where: { id: admin.id },
      data: { failCount: 0, lockedUntil: null },
    });
    const token = await this.jwtService.signAsync(
      { adminId: admin.id, userId: 0, openid: admin.username, role: 'admin' },
      { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
    );
    return { token, admin: this.publicAdmin(admin) };
  }

  async listAdmins(page?: number, pageSize?: number, keyword?: string) {
    const pagination = getPaginationParams({ page, pageSize });
    const where: any = {};
    if (keyword) where.OR = [{ username: { contains: keyword } }, { name: { contains: keyword } }];
    const [list, total] = await Promise.all([
      this.prisma.adminAccount.findMany({
        where,
        skip: pagination.skip,
        take: pagination.pageSize,
        orderBy: { id: 'asc' },
      }),
      this.prisma.adminAccount.count({ where }),
    ]);
    return buildPaginationResult(list.map((item) => this.publicAdmin(item)), total, pagination.page, pagination.pageSize);
  }

  permissionOptions() {
    return ADMIN_PERMISSIONS;
  }

  async saveAdmin(actor: any, data: any, id?: number) {
    if (!actor?.isSuper && id === actor?.id && data.isSuper === false) {
      throw new ForbiddenException('不能取消自己的超级管理员');
    }
    if (data.isSuper && !actor?.isSuper) throw new ForbiddenException('只有超级管理员能分配超级管理员');
    const current = id ? await this.prisma.adminAccount.findUnique({ where: { id } }) : null;
    if (id && !current) throw new NotFoundException('管理员不存在');
    if (current?.isSuper && !actor?.isSuper) throw new ForbiddenException('不能修改超级管理员');
    const username = String(data.username || current?.username || '').trim();
    if (!username) throw new BadRequestException('请填写账号');
    const password = String(data.password || '');
    if (!id && password.length < 6) throw new BadRequestException('密码至少 6 位');
    if (password && password.length < 6) throw new BadRequestException('密码至少 6 位');
    const isSuper = actor?.isSuper ? !!data.isSuper : !!current?.isSuper;
    const permissions = isSuper ? [] : parsePermissions(JSON.stringify(data.permissions || []));
    if (!isSuper && !permissions.length) throw new BadRequestException('请至少分配一项权限');
    const duplicated = await this.prisma.adminAccount.findFirst({
      where: id ? { username, NOT: { id } } : { username },
    });
    if (duplicated) throw new BadRequestException('账号已存在');
    const payload: any = {
      username,
      name: String(data.name || '管理员').trim() || '管理员',
      permissions: JSON.stringify(permissions),
      isSuper,
      status: Number(data.status ?? current?.status ?? 1) === 0 ? 0 : 1,
      failCount: 0,
      lockedUntil: null,
    };
    if (password) payload.password = await bcrypt.hash(password, 10);
    if (!id && !payload.password) throw new BadRequestException('请填写密码');
    if (current && current.id === actor?.id && payload.status === 0) throw new BadRequestException('不能停用自己');
    const saved = id
      ? await this.prisma.adminAccount.update({ where: { id }, data: payload })
      : await this.prisma.adminAccount.create({ data: payload });
    return this.publicAdmin(saved);
  }

  async deleteAdmin(actor: any, id: number) {
    const current = await this.prisma.adminAccount.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('管理员不存在');
    if (current.id === actor?.id) throw new BadRequestException('不能删除自己');
    if (current.isSuper) {
      const supers = await this.prisma.adminAccount.count({ where: { isSuper: true } });
      if (!actor?.isSuper || supers <= 1) throw new BadRequestException('至少保留一个超级管理员');
    }
    await this.prisma.adminAccount.delete({ where: { id } });
    return { id };
  }

  private verifyCaptcha(token: string, offset: number) {
    const store = loadCaptchaStore();
    const item = store.get(String(token || ''));
    if (!item) throw new BadRequestException('滑块验证已过期，请重试');
    const aligned = Math.abs(Number(offset) - item.x) <= CAPTCHA_TOLERANCE;
    if (!item.passed && !aligned) throw new BadRequestException('滑块验证未通过，请重试');
    store.delete(String(token || ''));
    saveCaptchaStore(store);
  }

  private captchaImage(x: number) {
    const blobs = [0, 1, 2, 3, 4, 5, 6, 7]
      .map((index) => {
        const colors = ['#dbe7ff', '#c7d7fe', '#bfdbfe', '#d1fae5', '#fde68a'];
        return `<circle cx="${24 + ((index * 53) % 230)}" cy="${28 + ((index * 37) % 90)}" r="16" fill="${colors[index % colors.length]}"/>`;
      })
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="150"><rect width="280" height="150" fill="#eef4ff"/>${blobs}<rect x="${x}" y="54" width="42" height="42" rx="8" fill="#0f172a" fill-opacity="0.72"/><rect x="${x + 8}" y="70" width="26" height="8" rx="2" fill="#fff"/></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  private publicAdmin(admin: any) {
    return {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      isSuper: admin.isSuper,
      status: admin.status,
      permissions: admin.isSuper ? ADMIN_PERMISSIONS.map((item) => item.key) : parsePermissions(admin.permissions),
      failCount: admin.failCount,
      lockedUntil: admin.lockedUntil,
      createdAt: admin.createdAt,
    };
  }

  private clock(date: Date) {
    const pad = (value: number) => `${value}`.padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private async ensureSuper() {
    const count = await this.prisma.adminAccount.count();
    if (count) return;
    const username = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    await this.prisma.adminAccount.create({
      data: {
        username,
        password: await bcrypt.hash(password, 10),
        name: '超级管理员',
        isSuper: true,
        permissions: '[]',
      },
    });
  }

  async getDashboardStats() {
    const since = this.daysAgo(13);
    const [
      userCount,
      courseCount,
      orderCount,
      totalRevenue,
      pendingOrderCount,
      commentCount,
      users,
      courses,
      orders,
      recentOrders,
      coursePreview,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.course.count({ where: { status: 1 } }),
      this.prisma.order.count({ where: { status: 'paid' } }),
      this.prisma.order.aggregate({
        where: { status: 'paid' },
        _sum: { payAmount: true },
      }),
      this.prisma.order.count({ where: { status: 'pending' } }),
      this.prisma.comment.count({ where: { status: 1 } }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.course.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, status: true, amount: true, payAmount: true },
      }),
      this.prisma.order.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { nickname: true } },
          course: { select: { title: true, cover: true } },
        },
      }),
      this.prisma.course.findMany({
        take: 6,
        orderBy: [{ studentCount: 'desc' }, { id: 'desc' }],
        include: { category: { select: { id: true, name: true } } },
      }),
    ]);

    const labels = this.lastDays(7);
    const prevLabels = this.lastDays(7, 7);
    const userMap = this.countByDay(users.map((item) => item.createdAt));
    const courseMap = this.countByDay(courses.map((item) => item.createdAt));
    const orderMap = this.countByDay(
      orders.filter((item) => item.status === 'paid').map((item) => item.createdAt),
    );
    const revenueMap = this.sumByDay(
      orders
        .filter((item) => item.status === 'paid')
        .map((item) => ({
          createdAt: item.createdAt,
          value: item.payAmount ?? item.amount,
        })),
    );

    return {
      userCount,
      courseCount,
      orderCount,
      commentCount,
      pendingOrderCount,
      totalRevenue: totalRevenue._sum.payAmount || 0,
      changes: {
        users: this.changeRate(labels, prevLabels, userMap),
        courses: this.changeRate(labels, prevLabels, courseMap),
        orders: this.changeRate(labels, prevLabels, orderMap),
        revenue: this.changeRate(labels, prevLabels, revenueMap),
      },
      trend: {
        labels: labels.map((day) => day.slice(5)),
        users: labels.map((day) => userMap[day] || 0),
        courses: labels.map((day) => courseMap[day] || 0),
        orders: labels.map((day) => orderMap[day] || 0),
        revenue: labels.map((day) => revenueMap[day] || 0),
      },
      recentOrders,
      coursePreview,
    };
  }

  async search(keyword = '') {
    const text = keyword.trim();
    if (!text) {
      return { courses: [], users: [], orders: [] };
    }

    const [courses, users, orders] = await Promise.all([
      this.prisma.course.findMany({
        where: { title: { contains: text } },
        take: 5,
        select: { id: true, title: true, cover: true },
      }),
      this.prisma.user.findMany({
        where: {
          OR: [{ nickname: { contains: text } }, { phone: { contains: text } }],
        },
        take: 5,
        select: { id: true, nickname: true, avatar: true },
      }),
      this.prisma.order.findMany({
        where: { orderNo: { contains: text } },
        take: 5,
        select: { id: true, orderNo: true, status: true },
      }),
    ]);

    return { courses, users, orders };
  }

  async getUsers(page?: number, pageSize?: number, keyword?: string) {
    const pagination = getPaginationParams({ page, pageSize });
    const where = keyword
      ? {
          OR: [
            { nickname: { contains: keyword } },
            { phone: { contains: keyword } },
            { openid: { contains: keyword } },
          ],
        }
      : {};

    const [list, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.pageSize,
        orderBy: { id: 'desc' },
        include: {
          _count: { select: { orders: true, userCourses: true, comments: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginationResult(list, total, pagination.page, pagination.pageSize);
  }

  async getCourses(
    page?: number,
    pageSize?: number,
    keyword?: string,
    status?: string,
    isFree?: string,
    categoryId?: string,
  ) {
    const pagination = getPaginationParams({ page, pageSize });
    const where: any = {};
    if (keyword) where.title = { contains: keyword };
    if (status === '0' || status === '1') where.status = Number(status);
    if (isFree === '1') where.isFree = true;
    if (isFree === '0') where.isFree = false;
    if (categoryId) where.categoryId = Number(categoryId);

    const [list, total, all, published, free] = await Promise.all([
      this.prisma.course.findMany({
        where,
        skip: pagination.skip,
        take: pagination.pageSize,
        orderBy: { id: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
          teacher: { select: { id: true, nickname: true, teacherCert: { select: { realName: true } } } },
          _count: { select: { orders: true, userCourses: true, sessions: true } },
        },
      }),
      this.prisma.course.count({ where }),
      this.prisma.course.count(),
      this.prisma.course.count({ where: { status: 1 } }),
      this.prisma.course.count({ where: { isFree: true } }),
    ]);

    return {
      ...buildPaginationResult(list, total, pagination.page, pagination.pageSize),
      stats: {
        all,
        published,
        unpublished: all - published,
        free,
        paid: all - free,
      },
    };
  }

  async getCourse(id: number) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        category: true,
        teacher: { select: { id: true, nickname: true } },
        lessons: { orderBy: { sort: 'asc' } },
        _count: { select: { comments: true, orders: true, userCourses: true } },
      },
    });
    if (!course) throw new NotFoundException('课程不存在');
    return course;
  }

  async getCategories() {
    return this.prisma.category.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { courses: true } } },
    });
  }

  async getOrders(page?: number, pageSize?: number, keyword?: string, status?: string) {
    const pagination = getPaginationParams({ page, pageSize });
    const where: any = {};
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { user: { nickname: { contains: keyword } } },
        { course: { title: { contains: keyword } } },
      ];
    }

    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: pagination.skip,
        take: pagination.pageSize,
        orderBy: { id: 'desc' },
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          course: { select: { id: true, title: true, cover: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return buildPaginationResult(list, total, pagination.page, pagination.pageSize);
  }

  async getComments(page?: number, pageSize?: number, keyword?: string) {
    const pagination = getPaginationParams({ page, pageSize });
    const where = keyword
      ? {
          OR: [
            { content: { contains: keyword } },
            { course: { title: { contains: keyword } } },
            { user: { nickname: { contains: keyword } } },
          ],
        }
      : {};

    const [list, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        skip: pagination.skip,
        take: pagination.pageSize,
        orderBy: { id: 'desc' },
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          course: { select: { id: true, title: true } },
        },
      }),
      this.prisma.comment.count({ where }),
    ]);

    return buildPaginationResult(list, total, pagination.page, pagination.pageSize);
  }

  async listSchools() {
    return this.prisma.school.findMany({
      orderBy: { id: 'desc' },
      include: { _count: { select: { courses: true } } },
    });
  }

  async saveSchool(data: any, id?: number) {
    if (!data.name?.trim()) throw new BadRequestException('请填写学校名称');
    const lng = data.lng === '' || data.lng == null ? null : Number(data.lng);
    const lat = data.lat === '' || data.lat == null ? null : Number(data.lat);
    if ((lng != null && Number.isNaN(lng)) || (lat != null && Number.isNaN(lat))) {
      throw new BadRequestException('地图坐标不正确');
    }
    const payload = {
      name: String(data.name).trim(),
      address: data.address?.trim() || null,
      province: data.province?.trim() || null,
      city: data.city?.trim() || null,
      lng,
      lat,
      status: Number(data.status ?? 1) === 0 ? 0 : 1,
    };
    if (id) {
      const current = await this.prisma.school.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('学校不存在');
      return this.prisma.school.update({ where: { id }, data: payload });
    }
    return this.prisma.school.create({ data: payload });
  }

  async getAmapConfig() {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: ['amapKey', 'amapSecurity'] } },
    });
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return { key: map.amapKey || '', security: map.amapSecurity || '' };
  }

  async saveAmapConfig(data: { key?: string; security?: string }) {
    const key = String(data.key || '').trim();
    const security = String(data.security || '').trim();
    if (!key) throw new BadRequestException('请填写高德 Key');
    if (!security) throw new BadRequestException('请填写高德安全密钥');
    await this.prisma.$transaction([
      this.prisma.appSetting.upsert({
        where: { key: 'amapKey' },
        create: { key: 'amapKey', value: key },
        update: { value: key },
      }),
      this.prisma.appSetting.upsert({
        where: { key: 'amapSecurity' },
        create: { key: 'amapSecurity', value: security },
        update: { value: security },
      }),
    ]);
    return { key, security };
  }

  async getAgreementConfig() {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: [AGREEMENT_TITLE_KEY, AGREEMENT_BODY_KEY] } },
    });
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      title: map[AGREEMENT_TITLE_KEY]?.trim() || DEFAULT_AGREEMENT.title,
      content: map[AGREEMENT_BODY_KEY]?.trim() || DEFAULT_AGREEMENT.content,
    };
  }

  async saveAgreementConfig(data: { title?: string; content?: string }) {
    const title = String(data.title || '').trim();
    const content = String(data.content || '').trim();
    if (!title) throw new BadRequestException('请填写协议标题');
    if (title.length > 30) throw new BadRequestException('协议标题不能超过 30 字');
    if (!content) throw new BadRequestException('请填写协议内容');
    if (content.length > 20000) throw new BadRequestException('协议内容不能超过 20000 字');
    await this.prisma.$transaction([
      this.prisma.appSetting.upsert({
        where: { key: AGREEMENT_TITLE_KEY },
        create: { key: AGREEMENT_TITLE_KEY, value: title },
        update: { value: title },
      }),
      this.prisma.appSetting.upsert({
        where: { key: AGREEMENT_BODY_KEY },
        create: { key: AGREEMENT_BODY_KEY, value: content },
        update: { value: content },
      }),
    ]);
    return { title, content };
  }

  async getContractConfig() {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: [CONTRACT_TITLE_KEY, CONTRACT_BODY_KEY] } },
    });
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      title: map[CONTRACT_TITLE_KEY]?.trim() || DEFAULT_CONTRACT.title,
      content: map[CONTRACT_BODY_KEY]?.trim() || DEFAULT_CONTRACT.content,
    };
  }

  async saveContractConfig(data: { title?: string; content?: string }) {
    const title = String(data.title || '').trim();
    const content = String(data.content || '').trim();
    if (!title) throw new BadRequestException('请填写合同标题');
    if (title.length > 30) throw new BadRequestException('合同标题不能超过 30 字');
    if (!content) throw new BadRequestException('请填写合同内容');
    if (content.length > 20000) throw new BadRequestException('合同内容不能超过 20000 字');
    await this.prisma.$transaction([
      this.prisma.appSetting.upsert({
        where: { key: CONTRACT_TITLE_KEY },
        create: { key: CONTRACT_TITLE_KEY, value: title },
        update: { value: title },
      }),
      this.prisma.appSetting.upsert({
        where: { key: CONTRACT_BODY_KEY },
        create: { key: CONTRACT_BODY_KEY, value: content },
        update: { value: content },
      }),
    ]);
    return { title, content };
  }

  getAppVersion() {
    const candidates = [
      join(process.cwd(), 'VERSION'),
      join(process.cwd(), '..', 'VERSION'),
    ];
    for (const file of candidates) {
      if (existsSync(file)) return readFileSync(file, 'utf8').trim();
    }
    return process.env.APP_VERSION || '0.0.0';
  }

  private compareVersion(a: string, b: string) {
    const left = String(a || '0').replace(/^v/i, '').split('.').map((n) => Number(n) || 0);
    const right = String(b || '0').replace(/^v/i, '').split('.').map((n) => Number(n) || 0);
    const len = Math.max(left.length, right.length);
    for (let i = 0; i < len; i += 1) {
      const x = left[i] || 0;
      const y = right[i] || 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }

  async getSystemInfo() {
    const current = this.getAppVersion();
    const repo = process.env.GITHUB_REPO || 'pmhw/HalfThereClass';
    return {
      name: 'HalfThereClass',
      current,
      repo: `https://github.com/${repo}`,
      releasesUrl: `https://github.com/${repo}/releases`,
    };
  }

  async getSystemUpdates() {
    const current = this.getAppVersion();
    const repo = process.env.GITHUB_REPO || 'pmhw/HalfThereClass';
    let releases: any[] = [];
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, {
        headers: this.githubHeaders(),
      });
      if (response.ok) releases = await response.json();
    } catch {
      releases = [];
    }
    const list = (Array.isArray(releases) ? releases : [])
      .filter((item) => !item.draft)
      .map((item) => {
        const asset = (item.assets || []).find((row: any) => /ubuntu22.*\.tar\.gz$/i.test(row.name || ''))
          || (item.assets || []).find((row: any) => /\.tar\.gz$/i.test(row.name || ''))
          || null;
        return {
          tag: item.tag_name,
          name: item.name || item.tag_name,
          publishedAt: item.published_at,
          notes: item.body || '',
          htmlUrl: item.html_url,
          downloadUrl: asset?.browser_download_url || item.html_url,
          assetName: asset?.name || '',
          size: asset?.size || 0,
          newer: this.compareVersion(item.tag_name, current) > 0,
        };
      });
    const updates = list.filter((item) => item.newer);
    const latest = updates[0] || list[0] || null;
    return {
      current,
      latest,
      hasUpdate: updates.length > 0,
      updates,
      releases: list,
      repo: `https://github.com/${repo}`,
      checkedAt: new Date().toISOString(),
    };
  }

  private installRoot() {
    const cwd = process.cwd();
    if (existsSync(join(cwd, '..', 'VERSION')) && existsSync(join(cwd, '..', 'www'))) {
      return join(cwd, '..');
    }
    if (existsSync(join(cwd, 'VERSION'))) return cwd;
    return cwd;
  }

  private githubHeaders(extra: Record<string, string> = {}) {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'HalfThereClass-Admin',
      'X-GitHub-Api-Version': '2022-11-28',
      ...extra,
    };
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async applyUpdate(tag?: string) {
    if (this.updating) throw new BadRequestException('正在更新，请稍候');
    const info = await this.getSystemUpdates();
    const target = tag
      ? info.releases.find((item: any) => item.tag === tag || item.tag === `v${tag}`)
      : info.updates[0] || null;
    if (!target) throw new BadRequestException('没有可更新的版本');
    if (!target.newer && !tag) throw new BadRequestException('已经是最新版本');
    if (!target.assetName || !/\.tar\.gz$/i.test(target.assetName)) {
      throw new BadRequestException('该版本没有 Ubuntu 部署包，无法自动更新');
    }
    this.updating = true;
    try {
      const root = this.installRoot();
      const work = join(root, 'uploads', 'updates');
      mkdirSync(work, { recursive: true });
      const archive = join(work, target.assetName);
      const extractDir = join(work, `extract-${Date.now()}`);
      mkdirSync(extractDir, { recursive: true });

      const download = await fetch(target.downloadUrl, {
        headers: this.githubHeaders({ Accept: 'application/octet-stream' }),
        redirect: 'follow',
      });
      if (!download.ok) {
        throw new BadRequestException(`下载更新包失败（${download.status}）。私有仓库请配置 GITHUB_TOKEN`);
      }
      const bytes = Buffer.from(await download.arrayBuffer());
      writeFileSync(archive, bytes);

      await this.runCommand(`tar -xzf "${archive}" -C "${extractDir}"`, root);
      const entries = readdirSync(extractDir);
      const packageDir = entries
        .map((name) => join(extractDir, name))
        .find((path) => existsSync(join(path, 'VERSION')) && existsSync(join(path, 'backend')));
      if (!packageDir) throw new BadRequestException('更新包结构不正确');

      const keepEnv = join(root, 'backend', '.env');
      const keepDb = join(root, 'backend', 'prisma', 'dev.db');
      const envBackup = existsSync(keepEnv) ? readFileSync(keepEnv) : null;
      const dbBackup = existsSync(keepDb) ? keepDb : null;
      const dbTemp = dbBackup ? join(work, `dev-keep-${Date.now()}.db`) : null;
      if (dbBackup && dbTemp) copyFileSync(dbBackup, dbTemp);

      if (existsSync(join(packageDir, 'www'))) {
        rmSync(join(root, 'www'), { recursive: true, force: true });
        cpSync(join(packageDir, 'www'), join(root, 'www'), { recursive: true });
      }
      mkdirSync(join(root, 'backend'), { recursive: true });
      for (const name of ['dist', 'package.json', 'package-lock.json', '.env.example', 'nest-cli.json', 'tsconfig.json', 'VERSION']) {
        const from = join(packageDir, 'backend', name);
        const to = join(root, 'backend', name);
        if (!existsSync(from)) continue;
        rmSync(to, { recursive: true, force: true });
        cpSync(from, to, { recursive: true });
      }
      if (existsSync(join(packageDir, 'backend', 'prisma'))) {
        mkdirSync(join(root, 'backend', 'prisma'), { recursive: true });
        for (const name of readdirSync(join(packageDir, 'backend', 'prisma'))) {
          if (name === 'dev.db' || name.endsWith('.db-journal')) continue;
          const from = join(packageDir, 'backend', 'prisma', name);
          const to = join(root, 'backend', 'prisma', name);
          rmSync(to, { recursive: true, force: true });
          cpSync(from, to, { recursive: true });
        }
      }
      for (const name of ['VERSION', 'start.sh', 'install.sh', 'README-SERVER.md']) {
        const from = join(packageDir, name);
        if (!existsSync(from)) continue;
        copyFileSync(from, join(root, name));
      }
      if (existsSync(join(packageDir, 'systemd'))) {
        cpSync(join(packageDir, 'systemd'), join(root, 'systemd'), { recursive: true });
      }
      if (envBackup) writeFileSync(keepEnv, envBackup);
      if (dbTemp && existsSync(dbTemp)) copyFileSync(dbTemp, keepDb);

      await this.runCommand('npm ci --omit=dev', join(root, 'backend'));
      await this.runCommand('npx prisma generate', join(root, 'backend'));
      await this.runCommand('npx prisma migrate deploy', join(root, 'backend'));

      writeFileSync(join(root, 'VERSION'), `${String(target.tag).replace(/^v/i, '')}\n`);
      writeFileSync(join(root, 'backend', 'VERSION'), `${String(target.tag).replace(/^v/i, '')}\n`);

      this.scheduleRestart(root);
      return {
        ok: true,
        restarting: true,
        version: String(target.tag).replace(/^v/i, ''),
        tag: target.tag,
        message: `已更新到 ${target.tag}，面板即将重启`,
      };
    } finally {
      setTimeout(() => { this.updating = false; }, 3000);
    }
  }

  private runCommand(command: string, cwd: string) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, {
        cwd,
        shell: true,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let err = '';
      child.stderr?.on('data', (chunk) => { err += String(chunk); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new BadRequestException(`命令失败: ${command}${err ? ` (${err.trim()})` : ''}`));
      });
    });
  }

  private scheduleRestart(root: string) {
    setTimeout(() => {
      try {
        const service = '/etc/systemd/system/halfthereclass.service';
        if (process.platform !== 'win32' && existsSync(service)) {
          spawn('systemctl', ['restart', 'halfthereclass'], { detached: true, stdio: 'ignore' }).unref();
          process.exit(0);
          return;
        }
        const startSh = join(root, 'start.sh');
        if (process.platform !== 'win32' && existsSync(startSh)) {
          spawn('bash', [startSh], {
            cwd: root,
            detached: true,
            stdio: 'ignore',
            env: process.env,
          }).unref();
          process.exit(0);
          return;
        }
        spawn(process.execPath, process.argv.slice(1), {
          cwd: process.cwd(),
          detached: true,
          stdio: 'ignore',
          env: process.env,
        }).unref();
        process.exit(0);
      } catch {
        process.exit(0);
      }
    }, 900);
  }

  private dbPath() {
    return join(process.cwd(), 'prisma', 'dev.db');
  }

  private initDbPath() {
    return join(process.cwd(), 'prisma', 'init.db');
  }

  private backupDir() {
    const dir = join(process.cwd(), 'uploads', 'backups');
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  private stamp() {
    const now = new Date();
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  }

  getDatabaseInfo() {
    const path = this.dbPath();
    const initPath = this.initDbPath();
    if (!existsSync(path)) {
      return {
        exists: false,
        path: 'prisma/dev.db',
        size: 0,
        updatedAt: null,
        hasInit: existsSync(initPath),
      };
    }
    const stat = statSync(path);
    return {
      exists: true,
      path: 'prisma/dev.db',
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      hasInit: existsSync(initPath),
    };
  }

  async exportDatabase() {
    const source = this.dbPath();
    if (!existsSync(source)) throw new NotFoundException('当前没有数据库文件');
    const name = `HalfThereClass-db-${this.stamp()}.db`;
    const target = join(this.backupDir(), name);
    try {
      const escaped = target.replace(/'/g, "''");
      await this.prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
    } catch {
      copyFileSync(source, target);
    }
    return new StreamableFile(createReadStream(target), {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${name}"`,
      length: statSync(target).size,
    });
  }

  async importDatabase(file?: { buffer?: Buffer; originalname?: string; size?: number }) {
    const buffer = file?.buffer;
    if (!buffer?.length) throw new BadRequestException('请上传 .db 数据库文件');
    if (buffer.length > 200 * 1024 * 1024) throw new BadRequestException('数据库文件不能超过 200MB');
    if (buffer.slice(0, 15).toString('utf8') !== 'SQLite format 3') {
      throw new BadRequestException('不是有效的 SQLite 数据库文件');
    }
    const target = this.dbPath();
    const dir = join(process.cwd(), 'prisma');
    mkdirSync(dir, { recursive: true });
    const incoming = join(this.backupDir(), `import-${randomUUID()}.db`);
    writeFileSync(incoming, buffer);
    let backupName = '';
    if (existsSync(target)) {
      backupName = `before-import-${this.stamp()}.db`;
      copyFileSync(target, join(this.backupDir(), backupName));
    }
    await this.prisma.$disconnect();
    try {
      copyFileSync(incoming, target);
      await this.prisma.$connect();
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      if (backupName) {
        copyFileSync(join(this.backupDir(), backupName), target);
        try { await this.prisma.$connect(); } catch { /* ignore */ }
      }
      throw new BadRequestException(`导入失败，已尝试回滚：${(err as Error).message || '未知错误'}`);
    } finally {
      try { unlinkSync(incoming); } catch { /* ignore */ }
    }
    return {
      ok: true,
      backup: backupName || null,
      size: buffer.length,
      message: backupName ? `导入成功，原库已备份为 ${backupName}` : '导入成功',
    };
  }

  async saveInitSnapshot() {
    const source = this.dbPath();
    if (!existsSync(source)) throw new NotFoundException('当前没有数据库文件');
    const target = this.initDbPath();
    try {
      const escaped = target.replace(/'/g, "''");
      await this.prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
    } catch {
      copyFileSync(source, target);
    }
    const stat = statSync(target);
    return {
      ok: true,
      path: 'prisma/init.db',
      size: stat.size,
      message: '已写入初始库快照 init.db，可提交到 Git 作为新环境起点',
    };
  }

  async deleteSchool(id: number) {
    const school = await this.prisma.school.findUnique({
      where: { id },
      include: { _count: { select: { courses: true } } },
    });
    if (!school) throw new NotFoundException('学校不存在');
    if (school._count.courses) throw new BadRequestException('已有课程使用该学校，不能删除');
    await this.prisma.school.delete({ where: { id } });
    return { ok: true };
  }

  async getTeachers() {
    const list = await this.prisma.user.findMany({
      where: { status: 1, teacherCert: { status: 'approved' } },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        nickname: true,
        phone: true,
        teacherCert: { select: { realName: true, teacherNo: true, contractStatus: true } },
      },
    });
    return list.map((item) => ({
      id: item.id,
      nickname: item.nickname,
      phone: item.phone,
      realName: item.teacherCert?.realName || '',
      teacherNo: item.teacherCert?.teacherNo || '',
      contractSigned: item.teacherCert?.contractStatus === 'signed',
    }));
  }

  async createCourse(data: any) {
    if (!data.title?.trim()) throw new BadRequestException('请填写课程名称');
    if (!data.categoryId) throw new BadRequestException('请选择分类');
    await this.ensureCategory(Number(data.categoryId));
    const teacherId = await this.normalizeTeacher(data.teacherId, null);
    const place = await this.schoolSnapshot(data);
    return this.prisma.course.create({
      data: { ...this.courseData(data, teacherId), ...place },
    });
  }

  async updateCourse(id: number, data: any) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('课程不存在');
    if (data.categoryId) await this.ensureCategory(Number(data.categoryId));
    const teacherId = data.teacherId === undefined ? course.teacherId : await this.normalizeTeacher(data.teacherId, course.teacherId);
    const place = data.schoolId === undefined && data.school === undefined
      ? {}
      : await this.schoolSnapshot(data);
    return this.prisma.course.update({
      where: { id },
      data: { ...this.courseData(data, teacherId), ...place },
    });
  }

  async deleteCourse(id: number) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: { _count: { select: { orders: true, userCourses: true } } },
    });
    if (!course) throw new NotFoundException('课程不存在');
    if (course.teacherId) {
      throw new BadRequestException('已安排老师的课程不能删除，请先取消排课');
    }
    if (course._count.orders || course._count.userCourses) {
      throw new BadRequestException('课程已有订单或学习记录，不能删除');
    }
    await this.prisma.checkIn.deleteMany({ where: { courseId: id } });
    await this.prisma.course.delete({ where: { id } });
    return { id };
  }

  async deleteCourses(ids: number[]) {
    const list = await this.prisma.course.findMany({
      where: { id: { in: this.normalizeIds(ids) } },
      include: { _count: { select: { orders: true, userCourses: true } } },
    });
    const blocked = [];
    const deletable = [];
    for (const course of list) {
      if (course.teacherId) blocked.push({ id: course.id, title: course.title, reason: '已安排老师' });
      else if (course._count.orders || course._count.userCourses) blocked.push({ id: course.id, title: course.title, reason: '已有订单或学习记录' });
      else deletable.push(course);
    }
    if (!deletable.length) {
      throw new BadRequestException(blocked.length ? this.blockedText(blocked) : '没有可删除的课程');
    }
    const deleted = deletable.map((course) => course.id);
    await this.prisma.$transaction([
      this.prisma.checkIn.deleteMany({ where: { courseId: { in: deleted } } }),
      this.prisma.course.deleteMany({ where: { id: { in: deleted } } }),
    ]);
    return { deleted, blocked };
  }

  async saveCategory(data: any, id?: number) {
    if (!data.name?.trim()) throw new BadRequestException('请填写分类名称');
    const payload = {
      name: data.name.trim(),
      sort: Number(data.sort || 0),
      status: Number(data.status ?? 1),
    };
    if (!id) return this.prisma.category.create({ data: payload });
    const exists = await this.prisma.category.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('分类不存在');
    return this.prisma.category.update({ where: { id }, data: payload });
  }

  async deleteCategory(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { courses: true } } },
    });
    if (!category) throw new NotFoundException('分类不存在');
    if (category._count.courses) throw new BadRequestException('分类下还有课程，不能删除');
    await this.prisma.category.delete({ where: { id } });
    return { id };
  }

  async deleteCategories(ids: number[]) {
    const list = await this.prisma.category.findMany({
      where: { id: { in: this.normalizeIds(ids) } },
      include: { _count: { select: { courses: true } } },
    });
    const blocked = list
      .filter((item) => item._count.courses)
      .map((item) => ({ id: item.id, title: item.name, reason: '分类下还有课程' }));
    const deleted = list.filter((item) => !item._count.courses).map((item) => item.id);
    if (!deleted.length) {
      throw new BadRequestException(blocked.length ? this.blockedText(blocked) : '没有可删除的分类');
    }
    await this.prisma.category.deleteMany({ where: { id: { in: deleted } } });
    return { deleted, blocked };
  }

  private normalizeIds(ids: any) {
    if (!Array.isArray(ids) || !ids.length) throw new BadRequestException('请选择要删除的数据');
    const unique = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!unique.length) throw new BadRequestException('请选择要删除的数据');
    if (unique.length > 100) throw new BadRequestException('一次最多删除 100 条');
    return unique;
  }

  private blockedText(blocked: { title: string; reason: string }[]) {
    return blocked.map((item) => `${item.title}（${item.reason}）`).join('、') + '，不能删除';
  }

  private courseData(data: any, teacherId: number | null) {
    const price = Number(data.price || 0);
    return {
      title: String(data.title || '').trim(),
      description: data.description || '',
      cover: data.cover || null,
      categoryId: Number(data.categoryId),
      price,
      originalPrice: data.originalPrice === '' || data.originalPrice == null ? null : Number(data.originalPrice),
      level: data.level || 'beginner',
      isFree: !!data.isFree || price === 0,
      isRecommend: !!data.isRecommend,
      isHot: !!data.isHot,
      status: Number(data.status ?? 1),
      classroom: data.classroom || null,
      gradeLabel: data.gradeLabel || null,
      sessionFee: data.sessionFee === '' || data.sessionFee == null ? null : Number(data.sessionFee),
      teacherId,
      seats: teacherId || data.allowEnroll === false ? 0 : 1,
    };
  }

  private async schoolSnapshot(data: any) {
    const schoolId = Number(data.schoolId || 0);
    if (!schoolId) return { schoolId: null, school: null, province: null, city: null };
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school || school.status !== 1) throw new BadRequestException('请选择有效学校');
    return {
      schoolId: school.id,
      school: school.name,
      province: school.province,
      city: school.city,
    };
  }

  private async ensureCategory(id: number) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new BadRequestException('分类不存在');
  }

  private async normalizeTeacher(teacherId: any, previousId?: number | null) {
    if (teacherId === null || teacherId === undefined || teacherId === '' || Number(teacherId) === 0) {
      return null;
    }
    const teacher = await this.prisma.user.findUnique({
      where: { id: Number(teacherId) },
      include: { teacherCert: true },
    });
    if (!teacher || teacher.status !== 1 || teacher.teacherCert?.status !== 'approved') {
      throw new BadRequestException('只能安排认证通过的老师');
    }
    const same = previousId != null && teacher.id === previousId;
    if (!same && teacher.teacherCert?.contractStatus !== 'signed') {
      throw new BadRequestException('该老师尚未签订合同，不能安排课程');
    }
    return teacher.id;
  }

  private daysAgo(days: number) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return date;
  }

  private dayKey(date: Date) {
    const value = new Date(date);
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }

  private lastDays(count: number, offset = 0) {
    return Array.from({ length: count }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - (count - 1 - index) - offset);
      return this.dayKey(date);
    });
  }

  private countByDay(dates: Date[]) {
    return dates.reduce<Record<string, number>>((result, date) => {
      const key = this.dayKey(date);
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
  }

  private sumByDay(rows: { createdAt: Date; value: number }[]) {
    return rows.reduce<Record<string, number>>((result, row) => {
      const key = this.dayKey(row.createdAt);
      result[key] = (result[key] || 0) + Number(row.value || 0);
      return result;
    }, {});
  }

  private changeRate(
    currentDays: string[],
    previousDays: string[],
    map: Record<string, number>,
  ) {
    const current = currentDays.reduce((sum, day) => sum + (map[day] || 0), 0);
    const previous = previousDays.reduce((sum, day) => sum + (map[day] || 0), 0);
    if (previous === 0) return current === 0 ? 0 : null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }
}
