import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { IdOcrService, IdOcrFields } from './id-ocr.service';

const CORE_FIELDS = ['name', 'idNumber'] as const;

@Injectable()
export class ContractFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ocr: IdOcrService,
  ) {}

  identityPayload(cert: any) {
    const ocrRaw = this.parseJson(cert?.ocrRaw);
    const fields: IdOcrFields = {
      name: cert?.realName || ocrRaw?.name,
      gender: cert?.gender || ocrRaw?.gender,
      ethnicity: cert?.ethnicity || ocrRaw?.ethnicity,
      birthday: cert?.birthday || ocrRaw?.birthday,
      idNumber: cert?.idNumber || ocrRaw?.idNumber,
      address: cert?.address || ocrRaw?.address,
      issuingAuthority: cert?.issuingAuthority || ocrRaw?.issuingAuthority,
      validFrom: cert?.idValidFrom || ocrRaw?.validFrom,
      validTo: cert?.idValidTo || ocrRaw?.validTo,
    };
    const hasPhotos = !!(cert?.idCard && cert?.idCardBack);
    const ocrStatus = cert?.ocrStatus || 'none';
    return {
      source: 'teacher_certification',
      hasPhotos,
      idCard: cert?.idCard || '',
      idCardBack: cert?.idCardBack || '',
      ocrStatus,
      ocrAttempts: cert?.ocrAttempts || 0,
      ocrError: cert?.ocrError || '',
      ocrAt: cert?.ocrAt || null,
      fields,
      ocrRaw,
    };
  }

  draftPayload(cert: any) {
    const formData = this.parseJson(cert?.contractDraftJson) || {};
    return {
      step: cert?.contractDraftStep || 1,
      flowStatus: cert?.contractFlowStatus || 'not_started',
      formData,
      updatedAt: cert?.contractDraftAt || null,
      previewConfirmed: !!formData.previewConfirmed,
    };
  }

  async ensureOcr(userId: number, force = false) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (!cert) throw new NotFoundException('请先完成教师认证');
    if (cert.status !== 'approved') throw new BadRequestException('认证通过后才能签署合同');

    const done = ['success', 'partial', 'manual_confirmed'].includes(cert.ocrStatus);
    if (done && !force) {
      return { ...this.identityPayload(cert), ran: false };
    }
    if (cert.ocrStatus === 'manual_review' && !force) {
      return { ...this.identityPayload(cert), ran: false };
    }
    if (!cert.idCard || !cert.idCardBack) {
      await this.prisma.teacherCert.update({
        where: { userId },
        data: { ocrStatus: 'failed', ocrError: '认证资料缺少身份证正反面照片' },
      });
      return {
        ...this.identityPayload({ ...cert, ocrStatus: 'failed', ocrError: '认证资料缺少身份证正反面照片' }),
        ran: true,
        missingPhotos: true,
      };
    }

    if (!force && cert.ocrAttempts >= 3 && cert.ocrStatus === 'failed') {
      await this.prisma.teacherCert.update({
        where: { userId },
        data: {
          ocrStatus: 'manual_review',
          contractFlowStatus: 'waiting_manual_review',
          ocrError: cert.ocrError || '多次识别失败，已转人工处理',
        },
      });
      return {
        ...this.identityPayload({ ...cert, ocrStatus: 'manual_review' }),
        ran: true,
        manualReview: true,
      };
    }

    await this.prisma.teacherCert.update({
      where: { userId },
      data: { ocrStatus: 'processing', ocrError: null },
    });

    // 认证页已填结构化信息：直接视为成功，避免历史教师无 OCR 配置时卡住
    if (!force && cert.idNumber && cert.address && cert.realName) {
      const seeded = this.ocr.seedFromCert(cert);
      const saved = await this.applyOcrResult(userId, cert, seeded, true);
      return { ...this.identityPayload(saved), ran: true, seeded: true };
    }

    let result = await this.ocr.recognizeFromCertPaths(cert.idCard, cert.idCardBack);
    // OCR 服务不可用时，若已有部分字段则 partial；否则 failed 允许手动填写
    if (result.status === 'failed' && (cert.realName || cert.idNumber || cert.address)) {
      const mixed = this.ocr.finalize({
        name: cert.realName || undefined,
        gender: cert.gender || undefined,
        idNumber: cert.idNumber || undefined,
        address: cert.address || undefined,
      }, { fallback: 'cert_fields', ocrError: result.error });
      result = mixed;
    }

    const saved = await this.applyOcrResult(userId, cert, result, false);
    return { ...this.identityPayload(saved), ran: true, resultStatus: result.status };
  }

  private async applyOcrResult(userId: number, cert: any, result: ReturnType<IdOcrService['finalize']>, seeded: boolean) {
    const fields = result.fields || {};
    const status = result.status === 'success' ? 'success' : result.status === 'partial' ? 'partial' : 'failed';
    const data: any = {
      ocrStatus: status,
      ocrAttempts: (cert.ocrAttempts || 0) + (seeded ? 0 : 1),
      ocrRaw: JSON.stringify(fields),
      ocrError: result.error || (result.missing?.length ? `待补充：${result.missing.join('、')}` : null),
      ocrAt: new Date(),
    };
    if (fields.name) data.realName = fields.name;
    if (fields.gender) data.gender = fields.gender;
    if (fields.ethnicity) data.ethnicity = fields.ethnicity;
    if (fields.birthday) data.birthday = fields.birthday;
    if (fields.idNumber) data.idNumber = fields.idNumber;
    if (fields.address) data.address = fields.address;
    if (fields.issuingAuthority) data.issuingAuthority = fields.issuingAuthority;
    if (fields.validFrom) data.idValidFrom = fields.validFrom;
    if (fields.validTo) data.idValidTo = fields.validTo;
    if (status === 'failed' && (cert.ocrAttempts || 0) + 1 >= 3) {
      data.ocrStatus = 'manual_review';
      data.contractFlowStatus = 'waiting_manual_review';
    }
    return this.prisma.teacherCert.update({ where: { userId }, data });
  }

  async saveDraft(userId: number, body: any) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (!cert) throw new NotFoundException('请先完成教师认证');
    if (cert.status !== 'approved') throw new BadRequestException('认证通过后才能填写合同');
    if (cert.contractStatus === 'pending_review') throw new BadRequestException('已有合同待审核');
    if (cert.ocrStatus === 'manual_review') {
      throw new BadRequestException('身份信息人工确认中，暂不能继续填写');
    }

    const incoming = body?.formData && typeof body.formData === 'object' ? body.formData : {};
    const prev = this.parseJson(cert.contractDraftJson) || {};
    const formData = { ...prev, ...incoming };

    const identity = formData.identity || {};
    const ocrRaw = this.parseJson(cert.ocrRaw) || {};
    const coreChanged = CORE_FIELDS.some((key) => {
      const next = String(identity[key] || identity[key === 'name' ? 'realName' : key] || '').trim();
      const origin = String((ocrRaw as any)[key] || (key === 'name' ? cert.realName : cert.idNumber) || '').trim();
      return next && origin && next !== origin;
    });

    // 同步可编辑身份字段到认证表（核心字段变更则进人工审核）
    const patch: any = {
      contractDraftJson: JSON.stringify(formData),
      contractDraftAt: new Date(),
      contractDraftStep: Number(body?.step || cert.contractDraftStep || 1),
      contractFlowStatus: body?.flowStatus || cert.contractFlowStatus || 'filling',
    };
    if (identity.name || identity.realName) patch.realName = String(identity.name || identity.realName).trim();
    if (identity.gender) patch.gender = String(identity.gender).trim();
    if (identity.ethnicity) patch.ethnicity = String(identity.ethnicity).trim();
    if (identity.birthday) patch.birthday = String(identity.birthday).trim();
    if (identity.address) patch.address = String(identity.address).trim();
    if (identity.idNumber) patch.idNumber = String(identity.idNumber).trim().toUpperCase();
    if (identity.contactAddress) formData.contactAddress = identity.contactAddress;
    if (formData.email !== undefined) patch.email = String(formData.email || '').trim() || null;
    if (formData.bankName !== undefined) patch.bankName = String(formData.bankName || '').trim() || null;
    if (formData.bankAccountName !== undefined) {
      patch.bankAccountName = String(formData.bankAccountName || '').trim() || null;
    }
    if (formData.bankAccount !== undefined) {
      const account = String(formData.bankAccount || '').trim().replace(/[\s\-]/g, '');
      patch.bankAccount = account || null;
      formData.bankAccount = account;
    }

    if (coreChanged && ['success', 'partial', 'manual_confirmed'].includes(cert.ocrStatus)) {
      patch.ocrStatus = 'manual_review';
      patch.contractFlowStatus = 'waiting_manual_review';
      await this.prisma.idOcrAudit.createMany({
        data: CORE_FIELDS.map((field) => ({
          userId,
          field: field === 'name' ? 'realName' : field,
          ocrValue: String((ocrRaw as any)[field] || (field === 'name' ? cert.realName : cert.idNumber) || ''),
          manualValue: String(identity[field] || identity.realName || ''),
          source: 'teacher',
        })),
      });
    }

    const saved = await this.prisma.teacherCert.update({
      where: { userId },
      data: { ...patch, contractDraftJson: JSON.stringify(formData) },
    });
    return {
      draft: this.draftPayload(saved),
      identity: this.identityPayload(saved),
      coreChanged,
      blockedByManualReview: saved.ocrStatus === 'manual_review',
    };
  }

  async confirmPreview(userId: number) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (!cert) throw new NotFoundException('请先完成教师认证');
    if (cert.ocrStatus === 'manual_review') throw new BadRequestException('身份信息人工确认中');
    if (!cert.idNumber || !cert.address || !cert.realName) {
      throw new BadRequestException('请先完成身份信息确认');
    }
    this.assertBankInfo(cert);
    const formData = this.parseJson(cert.contractDraftJson) || {};
    formData.previewConfirmed = true;
    const saved = await this.prisma.teacherCert.update({
      where: { userId },
      data: {
        contractDraftJson: JSON.stringify(formData),
        contractDraftStep: 3,
        contractFlowStatus: 'waiting_signature',
        contractDraftAt: new Date(),
      },
    });
    return this.draftPayload(saved);
  }

  async advanceToPreview(userId: number) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (!cert) throw new NotFoundException('请先完成教师认证');
    if (cert.ocrStatus === 'manual_review') throw new BadRequestException('身份信息人工确认中，暂不能生成合同');
    if (cert.ocrStatus === 'failed' || cert.ocrStatus === 'none' || cert.ocrStatus === 'processing') {
      throw new BadRequestException('请先完成身份证信息识别与核对');
    }
    if (!cert.idNumber || !cert.address || !cert.realName) {
      throw new BadRequestException('姓名、身份证号、住址为必填');
    }
    this.assertBankInfo(cert);
    const formData = this.parseJson(cert.contractDraftJson) || {};
    formData.identityConfirmed = true;
    formData.previewConfirmed = false;
    const saved = await this.prisma.teacherCert.update({
      where: { userId },
      data: {
        contractDraftJson: JSON.stringify(formData),
        contractDraftStep: 2,
        contractFlowStatus: 'preview',
        contractDraftAt: new Date(),
      },
    });
    return this.draftPayload(saved);
  }

  async requestManualReview(userId: number, reason?: string) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (!cert) throw new NotFoundException('请先完成教师认证');
    const saved = await this.prisma.teacherCert.update({
      where: { userId },
      data: {
        ocrStatus: 'manual_review',
        contractFlowStatus: 'waiting_manual_review',
        ocrError: reason || cert.ocrError || '教师申请人工处理',
      },
    });
    return this.identityPayload(saved);
  }

  async listOcrReviews() {
    const list = await this.prisma.teacherCert.findMany({
      where: { ocrStatus: { in: ['manual_review', 'failed', 'partial'] }, status: 'approved' },
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { id: true, nickname: true, phone: true } },
      },
    });
    return list.map((item) => ({
      userId: item.userId,
      realName: item.realName,
      nickname: item.user?.nickname,
      phone: item.user?.phone,
      ocrStatus: item.ocrStatus,
      ocrError: item.ocrError,
      ocrAttempts: item.ocrAttempts,
      idCard: item.idCard,
      idCardBack: item.idCardBack,
      fields: this.identityPayload(item).fields,
      updatedAt: item.updatedAt,
      reason: item.ocrError || (item.ocrStatus === 'partial' ? '部分字段缺失' : 'OCR异常'),
    }));
  }

  async adminConfirmIdentity(userId: number, body: any, admin?: { id?: number; name?: string }) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (!cert) throw new NotFoundException('教师认证不存在');
    const fields = body?.fields || body || {};
    const name = String(fields.name || fields.realName || cert.realName || '').trim();
    const idNumber = String(fields.idNumber || cert.idNumber || '').trim().toUpperCase();
    const address = String(fields.address || cert.address || '').trim();
    if (!name || !/^[0-9]{17}[0-9X]$/.test(idNumber) || !address) {
      throw new BadRequestException('请完整填写姓名、身份证号、住址');
    }
    const ocrRaw = this.parseJson(cert.ocrRaw) || {};
    const audits = [];
    for (const [field, next] of Object.entries({
      realName: name,
      idNumber,
      address,
      gender: fields.gender,
      ethnicity: fields.ethnicity,
      birthday: fields.birthday,
    })) {
      if (next == null || next === '') continue;
      const prev = field === 'realName' ? cert.realName : (cert as any)[field];
      if (String(prev || '') !== String(next)) {
        audits.push({
          userId,
          field,
          ocrValue: String((ocrRaw as any)[field === 'realName' ? 'name' : field] || prev || ''),
          manualValue: String(next),
          operatorId: admin?.id || null,
          operatorName: admin?.name || '管理员',
          source: 'admin',
        });
      }
    }
    if (audits.length) await this.prisma.idOcrAudit.createMany({ data: audits });

    const formData = this.parseJson(cert.contractDraftJson) || {};
    formData.identity = {
      ...(formData.identity || {}),
      name,
      idNumber,
      address,
      gender: fields.gender || cert.gender,
      ethnicity: fields.ethnicity || cert.ethnicity,
      birthday: fields.birthday || cert.birthday,
    };

    const saved = await this.prisma.teacherCert.update({
      where: { userId },
      data: {
        realName: name,
        idNumber,
        address,
        gender: fields.gender ? String(fields.gender) : cert.gender,
        ethnicity: fields.ethnicity ? String(fields.ethnicity) : cert.ethnicity,
        birthday: fields.birthday ? String(fields.birthday) : cert.birthday,
        ocrStatus: 'manual_confirmed',
        ocrError: null,
        contractFlowStatus: cert.contractFlowStatus === 'waiting_manual_review' ? 'filling' : cert.contractFlowStatus,
        contractDraftStep: Math.max(1, cert.contractDraftStep || 1),
        contractDraftJson: JSON.stringify(formData),
        contractDraftAt: new Date(),
      },
    });
    return this.identityPayload(saved);
  }

  /** 签合同阶段强制绑定收款信息 */
  private assertBankInfo(cert: { bankName?: string | null; bankAccountName?: string | null; bankAccount?: string | null }) {
    const bankName = String(cert.bankName || '').trim();
    const bankAccountName = String(cert.bankAccountName || '').trim();
    const bankAccount = String(cert.bankAccount || '').trim().replace(/[\s\-]/g, '');
    if (!bankName || !bankAccountName || !bankAccount) {
      throw new BadRequestException('签订合同前须填写收款开户行、收款名与银行账号');
    }
    if (bankAccount.length < 8 || bankAccount.length > 32 || !/^\d+$/.test(bankAccount)) {
      throw new BadRequestException('请填写正确的银行账号');
    }
  }

  private parseJson(raw?: string | null) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
