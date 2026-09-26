import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  CONTRACT_BODY_KEY,
  CONTRACT_PARTY_A_KEY,
  CONTRACT_TITLE_KEY,
  DEFAULT_CONTRACT,
  buildFilledContract,
  parsePartyA,
} from '@/common/contract';
import { calculateFee, teacherFeeView } from '@/modules/staff/fee';
import { UpdateUserDto } from './dto/update-user.dto';
import { SubmitCertDto } from './dto/submit-cert.dto';

type Tx = Prisma.TransactionClient;

const CERT_RANK: Record<string, number> = {
  approved: 4,
  pending: 3,
  frozen: 2,
  rejected: 1,
};

const ROLE_RANK: Record<string, number> = {
  admin: 3,
  teacher: 2,
  user: 1,
};

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findByOpenid(openid: string) {
    return this.prisma.user.findUnique({ where: { openid } });
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async findById(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return user;
  }

  async create(openid: string, data?: { nickname?: string; avatar?: string; phone?: string }) {
    return this.prisma.user.create({
      data: {
        openid,
        nickname: data?.nickname,
        avatar: data?.avatar,
        phone: data?.phone || null,
      },
    });
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    });
  }

  async getUserStats(userId: number) {
    const [userCourses, totalProgress] = await Promise.all([
      this.prisma.userCourse.count({ where: { userId } }),
      this.prisma.lessonProgress.count({
        where: { userId, isCompleted: true },
      }),
    ]);

    return {
      boughtCourses: userCourses,
      completedLessons: totalProgress,
      learningMinutes: 0,
    };
  }

  async getCert(userId: number) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    const semester = await this.openSemester();
    const semesterName = semester?.name || '';
    if (!cert) {
      return {
        status: 'none',
        clearanceDue: false,
        clearancePending: false,
        semesterName,
        contractSigned: false,
        contractValid: false,
        contractDue: false,
        contractPending: false,
      };
    }
    const clearancePending = cert.status === 'approved' && cert.clearanceStatus === 'pending';
    const clearanceDue = cert.status === 'approved' && !clearancePending && !!semester && cert.clearanceSemesterId !== semester.id;
    const contractPending = cert.contractStatus === 'pending_review';
    const contractValid = cert.contractStatus === 'signed'
      && !!semester
      && cert.contractSemesterId === semester.id;
    const contractDue = cert.status === 'approved' && !contractPending && !contractValid;
    const profileIncomplete = cert.status === 'approved' && (!cert.idNumber || !cert.address);
    return {
      ...cert,
      clearanceDue,
      clearancePending,
      semesterName,
      contractSigned: contractValid,
      contractValid,
      contractDue,
      contractPending,
      profileIncomplete,
      contractTip: contractPending
        ? '合同已提交，等待管理员审核'
        : contractDue
          ? (semester
            ? `合同按学期生效。当前学期「${semesterName}」需重新签订并审核通过后，才能解锁课程与抢课。`
            : '请签订教师服务合同')
          : contractValid
            ? `本合同有效期至本学期「${semesterName}」结束；下学期需重新签订。`
            : '',
    };
  }

  async getContract(userId: number) {
    const [cert, user, semester] = await Promise.all([
      this.prisma.teacherCert.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }),
      this.openSemester(),
    ]);
    const text = await this.contractText();
    const { annex, courses: annexCourses, assignedCourses } = await this.buildPendingCourseAnnex(userId);
    const history = await this.prisma.teacherContract.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        signedAt: true,
        reviewedAt: true,
        semesterId: true,
        courseAnnex: true,
        signPath: true,
        rejectReason: true,
        body: true,
      },
    });
    const contractValid = cert?.contractStatus === 'signed'
      && !!semester
      && cert.contractSemesterId === semester.id;
    const contractPending = cert?.contractStatus === 'pending_review';
    const contractDue = cert?.status === 'approved' && !contractPending && !contractValid;
    const currentRow = history.find((h) => (
      contractPending ? h.status === 'pending' : contractValid ? h.status === 'approved' : false
    )) || history.find((h) => ['approved', 'pending'].includes(h.status));
    // 已签/待审：展示快照；待签：甲方对公 + 乙方认证信息自动填入模板
    const content = currentRow?.body || await this.fillContractBody(text.content, {
      partyA: text.partyA,
      cert,
      phone: user?.phone,
      semester,
      annex,
      courses: annexCourses,
      userId,
    });
    const displayAnnex = currentRow?.courseAnnex || annex;
    const latestRevoked = history[0]?.status === 'revoked' ? history[0] : null;
    const tip = contractPending
      ? '您已提交签名，管理员审核通过后合同生效，预分配课程将自动解锁。'
      : contractDue
        ? latestRevoked
          ? `管理员已撤销您的合同${latestRevoked.rejectReason ? `（${latestRevoked.rejectReason}）` : ''}。合同按学期有效，请重新签字提交审核；通过前课程保持锁定。`
          : `合同按学期有效。当前学期：${semester?.name || '未设置'}。本学期需重新签订，请仔细阅读后签名提交审核。`
        : contractValid
          ? `本合同在本学期（${semester?.name}）内有效，学期结束后需重签。`
          : '认证通过后才能签订合同。';
    return {
      ...text,
      title: currentRow?.title || text.title,
      content,
      courseAnnex: displayAnnex,
      assignedCourses,
      status: cert?.status || 'none',
      signed: contractValid,
      contractValid,
      contractDue,
      contractPending,
      signedAt: cert?.contractSignedAt || null,
      sign: currentRow?.signPath || cert?.contractSign || '',
      semesterName: semester?.name || '',
      semesterId: semester?.id || null,
      tip,
      history,
    };
  }

  async signContract(userId: number, file?: { buffer?: Buffer }) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (cert?.status !== 'approved') throw new BadRequestException('认证通过后才能签订合同');
    if (cert.contractStatus === 'pending_review') throw new BadRequestException('已有合同待审核，请耐心等待');
    if (!cert.idNumber || !cert.address) {
      throw new BadRequestException('请先在认证页补全身份证号与住址，再签署合同');
    }
    const semester = await this.openSemester();
    if (!semester) throw new BadRequestException('当前没有开放学期，暂无法签订合同');
    if (cert.contractStatus === 'signed' && cert.contractSemesterId === semester.id) {
      throw new BadRequestException('本学期合同已生效，无需重复签订');
    }
    const buffer = file?.buffer;
    if (!buffer?.length) throw new BadRequestException('请手写签名');
    if (buffer.length > 2 * 1024 * 1024) throw new BadRequestException('签名图片过大');
    const ext = imageExt(buffer);
    const name = `${randomUUID()}${ext}`;
    const dir = join(process.cwd(), 'uploads', 'signs');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), buffer);
    const contractSign = `/uploads/signs/${name}`;

    const [text, user] = await Promise.all([
      this.contractText(),
      this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }),
    ]);
    const { annex, courses } = await this.buildPendingCourseAnnex(userId);
    const body = await this.fillContractBody(text.content, {
      partyA: text.partyA,
      cert,
      phone: user?.phone,
      semester,
      annex,
      courses,
      userId,
      signedAt: new Date(),
    });
    const exportHtml = this.buildContractHtml(text.title, body, contractSign, semester.name);

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.teacherContract.updateMany({
        where: { userId, status: 'approved' },
        data: { status: 'superseded' },
      });
      const created = await tx.teacherContract.create({
        data: {
          userId,
          semesterId: semester.id,
          title: text.title,
          body,
          signPath: contractSign,
          exportHtml,
          courseIds: JSON.stringify(courses.map((c) => c.id)),
          courseAnnex: annex || null,
          status: 'pending',
        },
      });
      await tx.teacherCert.update({
        where: { userId },
        data: {
          contractStatus: 'pending_review',
          contractSign,
          contractSignedAt: new Date(),
        },
      });
      return created;
    });

    return {
      signed: false,
      pending: true,
      id: row.id,
      sign: contractSign,
      message: '签名已提交，请等待管理员审核。审核通过后本学期合同生效，预分配课程将解锁。',
    };
  }

  async listMyContracts(userId: number) {
    return this.prisma.teacherContract.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
    });
  }

  async exportContractHtml(userId: number, contractId?: number) {
    const row = contractId
      ? await this.prisma.teacherContract.findFirst({ where: { id: contractId, userId } })
      : await this.prisma.teacherContract.findFirst({
          where: { userId, status: { in: ['approved', 'pending', 'superseded', 'revoked'] } },
          orderBy: { id: 'desc' },
        });
    if (!row) throw new NotFoundException('没有可导出的合同');
    const semester = row.semesterId
      ? await this.prisma.semester.findUnique({ where: { id: row.semesterId }, select: { name: true } })
      : null;
    const html = row.exportHtml || this.buildContractHtml(row.title, row.body, row.signPath, semester?.name || '');
    return {
      id: row.id,
      title: row.title,
      html,
      status: row.status,
      signedAt: row.signedAt,
      courseAnnex: row.courseAnnex,
      fileName: `教师服务合同-${row.id}.html`,
    };
  }

  /** 供小程序 downloadFile / 浏览器直接下载的 HTML 文件（打印可另存 PDF） */
  async exportContractFile(userId: number, contractId?: number) {
    const data = await this.exportContractHtml(userId, contractId);
    return data;
  }

  /** 预分配课程附件：金额展示跟随分配/机构的「教师可见」配置 */
  private async buildPendingCourseAnnex(userId: number) {
    const [user, pendingGrants] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { organization: true },
      }),
      this.prisma.teacherCourseGrant.findMany({
        where: { userId, lockState: 'pending_contract' },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              school: true,
              gradeLabel: true,
              weekday: true,
              startTime: true,
              endTime: true,
              sessionFee: true,
            },
          },
        },
      }),
    ]);
    const org = user?.organization;
    const hasOrg = !!org && org.status === 1;
    const week = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const lines = pendingGrants.map((g, i) => {
      const c = g.course;
      const when = [c.weekday ? week[c.weekday] : '', c.startTime ? `${c.startTime}${c.endTime ? `-${c.endTime}` : ''}` : '']
        .filter(Boolean)
        .join(' ');
      const base = g.baseFee != null ? Number(g.baseFee) : (c.sessionFee != null ? Number(c.sessionFee) : null);
      const mode = g.mode || (hasOrg ? org!.commissionMode : null);
      const value = g.value ?? (hasOrg ? org!.commissionValue : null);
      const visibility = g.visibility || org?.feeVisibility || 'final';
      const quote = calculateFee({ base, hasOrg, mode, value, visibility });
      const view = teacherFeeView(quote);
      const feePart = this.formatAnnexFee(view, quote.configured);
      return [
        `${i + 1}. ${c.title}`,
        c.gradeLabel ? `（${c.gradeLabel}）` : '',
        c.school ? ` · ${c.school}` : '',
        when ? ` · ${when}` : '',
        feePart ? ` · ${feePart}` : '',
      ].join('');
    });
    return {
      annex: lines.join('\n'),
      courses: pendingGrants.map((g) => g.course),
      assignedCourses: pendingGrants.map((g) => g.course),
    };
  }

  private formatAnnexFee(
    view: ReturnType<typeof teacherFeeView>,
    configured: boolean,
  ) {
    if (!configured) return '课时费待定';
    if (!view.showFee) return '课时费未开放';
    const money = (n: number | null | undefined) => `¥${Number(n || 0).toFixed(2)}`;
    // full：展示标准课时费、机构分佣、教师实得
    if ('baseFee' in view && view.baseFee != null && 'commission' in view) {
      return `课程标准 ${money(view.baseFee)} · 机构分佣 ${money(view.commission)} · 实得 ${money(view.teacherFee)}`;
    }
    // final：只看最终课时费
    return `课时费 ${money(view.teacherFee)}`;
  }

  private buildContractHtml(title: string, body: string, signPath: string, semesterName: string) {
    const safeBody = String(body || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
    const origin = (process.env.PUBLIC_ORIGIN || process.env.APP_ORIGIN || '').replace(/\/$/, '');
    const signSrc = signPath
      ? (signPath.startsWith('http') ? signPath : `${origin}${signPath}`)
      : '';
    const safeTitle = String(title || '教师服务合同')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeTitle}</title>
<style>
body{font-family:"PingFang SC","Microsoft YaHei",serif;max-width:800px;margin:24px auto;padding:0 16px 48px;color:#111;line-height:1.7;background:#fff}
h1{text-align:center;font-size:22px} .meta{color:#667085;font-size:13px;text-align:center;margin-bottom:24px}
.toolbar{position:sticky;top:0;background:#fff;padding:12px 0;margin-bottom:8px;border-bottom:1px solid #eef2f6;display:flex;gap:8px;flex-wrap:wrap}
.toolbar button{padding:10px 14px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-size:14px}
.sign{margin-top:32px} .sign img{max-width:280px;border:1px solid #e5e7eb;background:#fff}
@media print{.toolbar{display:none!important} body{margin:0;padding:12px}}
</style></head><body>
<div class="toolbar">
  <button type="button" onclick="window.print()">打印 / 另存为 PDF</button>
</div>
<script>window.addEventListener('load',function(){setTimeout(function(){try{window.print()}catch(e){}},400)});</script>
<h1>${safeTitle}</h1>
${semesterName ? `<p class="meta">适用学期：${semesterName}</p>` : ''}
<div>${safeBody}</div>
${signSrc ? `<div class="sign"><div>签名：</div><img src="${signSrc}" alt="签名"/></div>` : ''}
</body></html>`;
  }

  private async contractText() {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: [CONTRACT_TITLE_KEY, CONTRACT_BODY_KEY, CONTRACT_PARTY_A_KEY] } },
    });
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      title: map[CONTRACT_TITLE_KEY]?.trim() || DEFAULT_CONTRACT.title,
      content: map[CONTRACT_BODY_KEY]?.trim() || DEFAULT_CONTRACT.content,
      partyA: parsePartyA(map[CONTRACT_PARTY_A_KEY]),
    };
  }

  private async fillContractBody(
    template: string,
    opts: {
      partyA?: ReturnType<typeof parsePartyA>;
      cert?: {
        realName?: string | null;
        idNumber?: string | null;
        address?: string | null;
        email?: string | null;
        bankName?: string | null;
        bankAccountName?: string | null;
        bankAccount?: string | null;
      } | null;
      phone?: string | null;
      semester?: { id: number; name: string; startDate: string; endDate: string } | null;
      annex?: string;
      courses?: Array<{ title?: string | null; gradeLabel?: string | null }>;
      userId: number;
      signedAt?: Date | null;
    },
  ) {
    const partyA = opts.partyA || parsePartyA(
      (await this.prisma.appSetting.findUnique({ where: { key: CONTRACT_PARTY_A_KEY } }))?.value,
    );
    const subjects = (opts.courses || [])
      .map((c) => [c.gradeLabel, c.title].filter(Boolean).join(' '))
      .filter(Boolean);
    const gradeSubjects = subjects.length
      ? Array.from(new Set(subjects)).join('、')
      : '';
    return buildFilledContract(template, {
      partyA,
      realName: opts.cert?.realName,
      idNumber: opts.cert?.idNumber,
      address: opts.cert?.address,
      phone: opts.phone,
      email: opts.cert?.email,
      bankName: opts.cert?.bankName,
      bankAccountName: opts.cert?.bankAccountName,
      bankAccount: opts.cert?.bankAccount,
      semesterName: opts.semester?.name,
      semesterStart: opts.semester?.startDate,
      semesterEnd: opts.semester?.endDate,
      courseAnnex: opts.annex,
      gradeSubjects,
      userId: opts.userId,
      semesterId: opts.semester?.id,
      signedAt: opts.signedAt,
    });
  }

  async submitCert(userId: number, data: SubmitCertDto) {
    const current = await this.prisma.teacherCert.findUnique({ where: { userId } });
    const semester = await this.openSemester();
    const clearance = this.certFile(data.clearance);
    const updatingClearance = current?.status === 'approved'
      && !!semester
      && current.clearanceSemesterId !== semester.id;
    if (updatingClearance) {
      if (!clearance) throw new BadRequestException('请上传本学期无犯罪证明');
      return this.prisma.teacherCert.update({
        where: { userId },
        data: { clearance, clearanceStatus: 'pending' },
      });
    }

    const realName = data.realName?.trim() || current?.realName || '';
    const idNumber = String(data.idNumber || '').trim().toUpperCase();
    const address = String(data.address || '').trim();
    const email = String(data.email || '').trim();
    const bankName = String(data.bankName || '').trim();
    const bankAccountName = String(data.bankAccountName || '').trim() || realName || '';
    const bankAccount = String(data.bankAccount || '').trim();

    // 已认证教师：仅补全合同所需身份/收款信息，不重新走审核
    if (current?.status === 'approved') {
      if (!/^[0-9]{17}[0-9X]$/.test(idNumber)) throw new BadRequestException('请填写正确的身份证号码');
      if (!address) throw new BadRequestException('请填写身份证住址');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException('电子邮箱格式不正确');
      }
      return this.prisma.teacherCert.update({
        where: { userId },
        data: {
          ...(realName ? { realName } : {}),
          idNumber,
          address,
          email: email || null,
          bankName: bankName || null,
          bankAccountName: bankAccountName || null,
          bankAccount: bankAccount || null,
        },
      });
    }

    const idCard = this.certFile(data.idCard);
    const idCardBack = this.certFile(data.idCardBack);
    const diploma = this.certFile(data.diploma);
    if (!realName) throw new BadRequestException('请填写姓名');
    if (!/^[0-9]{17}[0-9X]$/.test(idNumber)) throw new BadRequestException('请填写正确的身份证号码');
    if (!address) throw new BadRequestException('请填写身份证住址');
    if (!idCard || !idCardBack) throw new BadRequestException('请上传身份证正反面');
    if (!diploma) throw new BadRequestException('请上传学历证明');
    if (!clearance) throw new BadRequestException('请上传无犯罪证明');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('电子邮箱格式不正确');
    }
    const certificate = this.certFile(data.certificate);
    const teacherNo = `TEA-${new Date().getFullYear()}${String(userId).padStart(4, '0')}`;
    const profile = {
      realName,
      idNumber,
      address,
      email: email || null,
      bankName: bankName || null,
      bankAccountName: bankAccountName || null,
      bankAccount: bankAccount || null,
      idCard,
      idCardBack,
      diploma,
      clearance,
      certificate,
    };
    const cert = await this.prisma.teacherCert.upsert({
      where: { userId },
      update: {
        ...profile,
        status: 'pending',
        clearanceStatus: 'pending',
        rejectReason: null,
      },
      create: {
        userId,
        ...profile,
        status: 'pending',
        clearanceStatus: 'pending',
        teacherNo,
      },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { nickname: realName } });
    return cert;
  }

  async saveCertFile(file?: { buffer?: Buffer; path?: string; mimetype?: string }) {
    let buffer = file?.buffer;
    if ((!buffer || !buffer.length) && file?.path) {
      buffer = await readFile(file.path);
    }
    if (!buffer?.length) throw new BadRequestException('请上传证明材料');
    if (buffer.length > 8 * 1024 * 1024) throw new BadRequestException('证明材料不能超过 8MB');
    const ext = certExt(buffer);
    const name = `${randomUUID()}${ext}`;
    const dir = join(process.cwd(), 'uploads', 'certs');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), buffer);
    return { url: `/uploads/certs/${name}` };
  }

  private certFile(value?: string) {
    const text = value?.trim();
    if (!text) return null;
    if (!text.startsWith('/uploads/certs/')) throw new BadRequestException('请先上传证明材料');
    return text;
  }

  private async openSemester() {
    const now = new Date();
    const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
    return this.prisma.semester.findFirst({
      where: { status: 1, startDate: { lte: today }, endDate: { gte: today } },
      orderBy: { id: 'desc' },
    });
  }

  async touchLogin(id: number) {
    await this.prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  async applyLogin(id: number, data: { nickname?: string; avatar?: string; phone?: string }) {
    const nickname = data.nickname?.trim();
    return this.prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        ...(nickname ? { nickname: nickname.slice(0, 30) } : {}),
        ...(data.avatar ? { avatar: data.avatar } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
      },
    });
  }

  async saveAvatar(userId: number, file?: { buffer?: Buffer }) {
    const buffer = file?.buffer;
    if (!buffer?.length) throw new BadRequestException('请上传头像');
    if (buffer.length > 2 * 1024 * 1024) throw new BadRequestException('头像不能超过 2MB');
    const ext = imageExt(buffer);
    const name = `${randomUUID()}${ext}`;
    const dir = join(process.cwd(), 'uploads', 'avatars');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), buffer);
    const avatar = `/uploads/avatars/${name}`;
    await this.prisma.user.update({ where: { id: userId }, data: { avatar } });
    return { avatar };
  }

  /**
   * 微信账号绑定手机号：若该手机号已有独立账号（H5 短信注册），合并到当前微信账号，
   * 并保留更完整的认证/合同与授课数据。
   */
  async bindPhoneAndMerge(keeperId: number, phone: string) {
    const keeper = await this.findById(keeperId);
    if (String(keeper.openid || '').startsWith('phone:')) {
      throw new BadRequestException('请在微信小程序内绑定手机号');
    }
    if (keeper.phone === phone) return keeper;
    if (keeper.phone && keeper.phone !== phone) {
      throw new BadRequestException('当前账号已绑定其他手机号，如需更换请联系管理员');
    }

    const donor = await this.findByPhone(phone);
    if (!donor) {
      return this.prisma.user.update({ where: { id: keeperId }, data: { phone } });
    }
    if (donor.id === keeperId) return donor;
    if (!String(donor.openid || '').startsWith('phone:') && donor.openid !== keeper.openid) {
      // 手机号已挂在另一个微信账号上
      throw new BadRequestException('该手机号已绑定其他微信账号');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: donor.id }, data: { phone: null } });
      await this.mergeTeacherCert(tx, keeperId, donor.id);
      await this.reassignUserRows(tx, keeperId, donor.id);

      const role =
        (ROLE_RANK[keeper.role] || 0) >= (ROLE_RANK[donor.role] || 0) ? keeper.role : donor.role;

      await tx.user.update({
        where: { id: keeperId },
        data: {
          phone,
          role,
          organizationId: keeper.organizationId ?? donor.organizationId,
          parentId: keeper.parentId ?? donor.parentId,
          nickname: keeper.nickname || donor.nickname,
          avatar: keeper.avatar || donor.avatar,
        },
      });
      await tx.user.updateMany({ where: { parentId: donor.id }, data: { parentId: keeperId } });
      await tx.user.delete({ where: { id: donor.id } });
      return tx.user.findUniqueOrThrow({ where: { id: keeperId } });
    });
  }

  private async mergeTeacherCert(tx: Tx, keeperId: number, donorId: number) {
    const [keeperCert, donorCert] = await Promise.all([
      tx.teacherCert.findUnique({ where: { userId: keeperId } }),
      tx.teacherCert.findUnique({ where: { userId: donorId } }),
    ]);
    if (!donorCert) return;
    if (!keeperCert) {
      await tx.teacherCert.update({ where: { userId: donorId }, data: { userId: keeperId } });
      return;
    }

    const preferDonor =
      (CERT_RANK[donorCert.status] || 0) > (CERT_RANK[keeperCert.status] || 0)
      || (
        (CERT_RANK[donorCert.status] || 0) === (CERT_RANK[keeperCert.status] || 0)
        && donorCert.contractStatus === 'signed'
        && keeperCert.contractStatus !== 'signed'
      );

    const preferred = preferDonor ? donorCert : keeperCert;
    const other = preferDonor ? keeperCert : donorCert;
    const data = {
      realName: preferred.realName || other.realName,
      gender: preferred.gender || other.gender,
      teacherNo: preferred.teacherNo || other.teacherNo,
      status: preferred.status,
      idCard: preferred.idCard || other.idCard,
      idCardBack: preferred.idCardBack || other.idCardBack,
      idNumber: preferred.idNumber || other.idNumber,
      address: preferred.address || other.address,
      email: preferred.email || other.email,
      bankName: preferred.bankName || other.bankName,
      bankAccountName: preferred.bankAccountName || other.bankAccountName,
      bankAccount: preferred.bankAccount || other.bankAccount,
      diploma: preferred.diploma || other.diploma,
      clearance: preferred.clearance || other.clearance,
      clearanceStatus:
        preferred.clearanceStatus !== 'none' ? preferred.clearanceStatus : other.clearanceStatus,
      clearanceSemesterId: preferred.clearanceSemesterId ?? other.clearanceSemesterId,
      certificate: preferred.certificate || other.certificate,
      contractStatus:
        preferred.contractStatus === 'signed' || other.contractStatus === 'signed'
          ? 'signed'
          : preferred.contractStatus || other.contractStatus,
      contractSignedAt: preferred.contractSignedAt || other.contractSignedAt,
      contractSign: preferred.contractSign || other.contractSign,
      bio: preferred.bio || other.bio,
      skills: preferred.skills || other.skills,
      rejectReason: preferred.rejectReason || other.rejectReason,
    };

    // teacherNo 唯一：先删掉另一份，再写回保留份
    if (other.teacherNo && preferred.teacherNo && other.teacherNo !== preferred.teacherNo) {
      await tx.teacherCert.update({ where: { id: other.id }, data: { teacherNo: null } });
    }
    await tx.teacherCert.delete({ where: { id: other.id } });
    await tx.teacherCert.update({
      where: { id: preferred.id },
      data: { ...data, userId: keeperId },
    });
  }

  private async reassignUserRows(tx: Tx, keeperId: number, donorId: number) {
    await tx.course.updateMany({ where: { teacherId: donorId }, data: { teacherId: keeperId } });

    const grants = await tx.teacherCourseGrant.findMany({ where: { userId: donorId } });
    for (const row of grants) {
      const exists = await tx.teacherCourseGrant.findUnique({
        where: { userId_courseId: { userId: keeperId, courseId: row.courseId } },
      });
      if (exists) await tx.teacherCourseGrant.delete({ where: { id: row.id } });
      else await tx.teacherCourseGrant.update({ where: { id: row.id }, data: { userId: keeperId } });
    }

    const incomes = await tx.sessionIncome.findMany({ where: { userId: donorId } });
    for (const row of incomes) {
      const exists = await tx.sessionIncome.findUnique({
        where: {
          userId_courseId_date: { userId: keeperId, courseId: row.courseId, date: row.date },
        },
      });
      if (exists) await tx.sessionIncome.delete({ where: { id: row.id } });
      else await tx.sessionIncome.update({ where: { id: row.id }, data: { userId: keeperId } });
    }

    const checkIns = await tx.checkIn.findMany({ where: { userId: donorId } });
    for (const row of checkIns) {
      const exists = await tx.checkIn.findUnique({
        where: {
          userId_courseId_date: { userId: keeperId, courseId: row.courseId, date: row.date },
        },
      });
      if (exists) await tx.checkIn.delete({ where: { id: row.id } });
      else await tx.checkIn.update({ where: { id: row.id }, data: { userId: keeperId } });
    }

    const userCourses = await tx.userCourse.findMany({ where: { userId: donorId } });
    for (const row of userCourses) {
      const exists = await tx.userCourse.findUnique({
        where: { userId_courseId: { userId: keeperId, courseId: row.courseId } },
      });
      if (exists) await tx.userCourse.delete({ where: { id: row.id } });
      else await tx.userCourse.update({ where: { id: row.id }, data: { userId: keeperId } });
    }

    const progresses = await tx.lessonProgress.findMany({ where: { userId: donorId } });
    for (const row of progresses) {
      const exists = await tx.lessonProgress.findUnique({
        where: { userId_lessonId: { userId: keeperId, lessonId: row.lessonId } },
      });
      if (exists) await tx.lessonProgress.delete({ where: { id: row.id } });
      else await tx.lessonProgress.update({ where: { id: row.id }, data: { userId: keeperId } });
    }

    await tx.order.updateMany({ where: { userId: donorId }, data: { userId: keeperId } });
    await tx.comment.updateMany({ where: { userId: donorId }, data: { userId: keeperId } });
  }
}

function certExt(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return '.jpg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return '.png';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return '.webp';
  if (buffer.slice(0, 4).toString('ascii') === '%PDF') return '.pdf';
  throw new BadRequestException('请上传 jpg、png、webp 或 pdf');
}

function imageExt(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return '.jpg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return '.png';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return '.webp';
  throw new BadRequestException('请上传 jpg、png 或 webp 头像');
}
