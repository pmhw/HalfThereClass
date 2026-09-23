import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CONTRACT_BODY_KEY, CONTRACT_TITLE_KEY, DEFAULT_CONTRACT } from '@/common/contract';
import { UpdateUserDto } from './dto/update-user.dto';
import { SubmitCertDto } from './dto/submit-cert.dto';

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
    if (!cert) return { status: 'none', clearanceDue: false, clearancePending: false, semesterName, contractSigned: false };
    const clearancePending = cert.status === 'approved' && cert.clearanceStatus === 'pending';
    const clearanceDue = cert.status === 'approved' && !clearancePending && !!semester && cert.clearanceSemesterId !== semester.id;
    return {
      ...cert,
      clearanceDue,
      clearancePending,
      semesterName,
      contractSigned: cert.contractStatus === 'signed',
    };
  }

  async getContract(userId: number) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    const text = await this.contractText();
    return {
      ...text,
      status: cert?.status || 'none',
      signed: cert?.contractStatus === 'signed',
      signedAt: cert?.contractSignedAt || null,
      sign: cert?.contractSign || '',
    };
  }

  async signContract(userId: number, file?: { buffer?: Buffer }) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (cert?.status !== 'approved') throw new BadRequestException('认证通过后才能签订合同');
    if (cert.contractStatus === 'signed') throw new BadRequestException('合同已签订');
    const buffer = file?.buffer;
    if (!buffer?.length) throw new BadRequestException('请手写签名');
    if (buffer.length > 2 * 1024 * 1024) throw new BadRequestException('签名图片过大');
    const ext = imageExt(buffer);
    const name = `${randomUUID()}${ext}`;
    const dir = join(process.cwd(), 'uploads', 'signs');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), buffer);
    const contractSign = `/uploads/signs/${name}`;
    await this.prisma.teacherCert.update({
      where: { userId },
      data: { contractStatus: 'signed', contractSignedAt: new Date(), contractSign },
    });
    return { signed: true, sign: contractSign };
  }

  private async contractText() {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: [CONTRACT_TITLE_KEY, CONTRACT_BODY_KEY] } },
    });
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      title: map[CONTRACT_TITLE_KEY]?.trim() || DEFAULT_CONTRACT.title,
      content: map[CONTRACT_BODY_KEY]?.trim() || DEFAULT_CONTRACT.content,
    };
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
    const realName = data.realName?.trim();
    const idCard = this.certFile(data.idCard);
    const idCardBack = this.certFile(data.idCardBack);
    const diploma = this.certFile(data.diploma);
    if (!realName) throw new BadRequestException('请填写姓名');
    if (!idCard || !idCardBack) throw new BadRequestException('请上传身份证正反面');
    if (!diploma) throw new BadRequestException('请上传学历证明');
    if (!clearance) throw new BadRequestException('请上传无犯罪证明');
    const certificate = this.certFile(data.certificate);
    const teacherNo = `TEA-${new Date().getFullYear()}${String(userId).padStart(4, '0')}`;
    const cert = await this.prisma.teacherCert.upsert({
      where: { userId },
      update: {
        realName,
        idCard,
        idCardBack,
        diploma,
        clearance,
        certificate,
        status: 'pending',
        clearanceStatus: 'pending',
        rejectReason: null,
      },
      create: {
        userId,
        realName,
        idCard,
        idCardBack,
        diploma,
        clearance,
        certificate,
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
