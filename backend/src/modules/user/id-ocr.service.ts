import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '@/common/prisma/prisma.service';

export type IdOcrFields = {
  name?: string;
  gender?: string;
  ethnicity?: string;
  birthday?: string;
  idNumber?: string;
  address?: string;
  issuingAuthority?: string;
  validFrom?: string;
  validTo?: string;
};

export type IdOcrResult = {
  status: 'success' | 'partial' | 'failed';
  fields: IdOcrFields;
  missing: string[];
  raw?: any;
  error?: string;
};

const REQUIRED = ['name', 'idNumber', 'address'] as const;

@Injectable()
export class IdOcrService {
  private readonly logger = new Logger(IdOcrService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recognizeFromCertPaths(idCard?: string | null, idCardBack?: string | null): Promise<IdOcrResult> {
    if (!idCard && !idCardBack) {
      return { status: 'failed', fields: {}, missing: [...REQUIRED], error: '缺少身份证照片' };
    }
    const keys = await this.resolveAliyunKeys();
    if (!keys) {
      return {
        status: 'failed',
        fields: {},
        missing: [...REQUIRED],
        error: '未配置 OCR：请设置 OCR_ACCESS_KEY_ID/SECRET，或配置阿里云短信同款 AccessKey',
      };
    }
    const front = idCard ? await this.readUpload(idCard) : null;
    if (!front) {
      return { status: 'failed', fields: {}, missing: [...REQUIRED], error: '无法读取身份证人像面图片' };
    }
    try {
      const face = await this.aliyunRecognize(front, keys);
      const backBuf = idCardBack ? await this.readUpload(idCardBack) : null;
      const back = backBuf ? await this.aliyunRecognize(backBuf, keys).catch(() => ({} as IdOcrFields)) : {};
      return this.finalize({ ...face, ...back }, { provider: 'aliyun' });
    } catch (err: any) {
      this.logger.warn(`OCR failed: ${err?.message || err}`);
      return { status: 'failed', fields: {}, missing: [...REQUIRED], error: err?.message || 'OCR 服务异常' };
    }
  }

  seedFromCert(cert: {
    realName?: string | null;
    gender?: string | null;
    idNumber?: string | null;
    address?: string | null;
    ethnicity?: string | null;
    birthday?: string | null;
    issuingAuthority?: string | null;
    idValidFrom?: string | null;
    idValidTo?: string | null;
  }): IdOcrResult {
    return this.finalize({
      name: cert.realName || undefined,
      gender: cert.gender || undefined,
      idNumber: cert.idNumber || undefined,
      address: cert.address || undefined,
      ethnicity: cert.ethnicity || undefined,
      birthday: cert.birthday || undefined,
      issuingAuthority: cert.issuingAuthority || undefined,
      validFrom: cert.idValidFrom || undefined,
      validTo: cert.idValidTo || undefined,
    }, { source: 'cert_seed' });
  }

  finalize(fields: IdOcrFields, raw?: any): IdOcrResult {
    const cleaned: IdOcrFields = {};
    for (const [k, v] of Object.entries(fields || {})) {
      const text = String(v || '').trim();
      if (text) (cleaned as any)[k] = text;
    }
    if (cleaned.idNumber) cleaned.idNumber = cleaned.idNumber.toUpperCase();
    if (cleaned.birthday) cleaned.birthday = this.normalizeDate(cleaned.birthday);
    const missing = REQUIRED.filter((key) => !(cleaned as any)[key]);
    if (!missing.length) return { status: 'success', fields: cleaned, missing: [], raw };
    if (Object.keys(cleaned).length) return { status: 'partial', fields: cleaned, missing: [...missing], raw };
    return { status: 'failed', fields: {}, missing: [...REQUIRED], raw, error: '未能识别有效字段' };
  }

  private normalizeDate(value: string) {
    const cn = value.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (cn) return `${cn[1]}-${cn[2].padStart(2, '0')}-${cn[3].padStart(2, '0')}`;
    const iso = value.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    return value;
  }

  private async readUpload(path: string) {
    const rel = String(path || '').replace(/^\/+/, '');
    if (!rel.startsWith('uploads/')) return null;
    try {
      return await readFile(join(process.cwd(), rel));
    } catch {
      return null;
    }
  }

  private async resolveAliyunKeys() {
    const fromEnv = {
      accessKeyId: process.env.OCR_ACCESS_KEY_ID || process.env.SMS_ACCESS_KEY_ID || '',
      accessKeySecret: process.env.OCR_ACCESS_KEY_SECRET || process.env.SMS_ACCESS_KEY_SECRET || '',
    };
    if (fromEnv.accessKeyId && fromEnv.accessKeySecret) return fromEnv;
    try {
      const row = await this.prisma.appSetting.findUnique({ where: { key: 'sms' } });
      if (!row?.value) return null;
      const data = JSON.parse(row.value);
      if (data.accessKeyId && data.accessKeySecret) {
        return { accessKeyId: String(data.accessKeyId), accessKeySecret: String(data.accessKeySecret) };
      }
    } catch { /* ignore */ }
    return null;
  }

  /** 调用阿里云 RecognizeIdcard（需开通文字识别 OCR 并安装 SDK） */
  private async aliyunRecognize(buffer: Buffer, keys: { accessKeyId: string; accessKeySecret: string }): Promise<IdOcrFields> {
    let Ocr20210707: any;
    let OpenApi: any;
    let Credential: any;
    try {
      // 可选依赖：未安装时走失败分支，由上层用认证页已填字段兜底
      // eslint-disable-next-line no-new-func
      const dynImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
      Ocr20210707 = await dynImport('@alicloud/ocr-api20210707');
      OpenApi = await dynImport('@alicloud/openapi-client');
      Credential = await dynImport('@alicloud/credentials');
    } catch {
      throw new Error('未安装阿里云 OCR SDK，或密钥无效；将尝试使用认证页已填信息');
    }
    const cred = new Credential.default({
      type: 'access_key',
      accessKeyId: keys.accessKeyId,
      accessKeySecret: keys.accessKeySecret,
    });
    const config = new OpenApi.Config({ credential: cred, endpoint: 'ocr-api.cn-hangzhou.aliyuncs.com' });
    const client = new Ocr20210707.default(config);
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const tmp = path.join(os.tmpdir(), `idcard-${Date.now()}.jpg`);
    await fs.promises.writeFile(tmp, buffer);
    try {
      const req = new Ocr20210707.RecognizeIdcardRequest({ body: fs.createReadStream(tmp) });
      const res = await client.recognizeIdcard(req);
      const data = typeof res?.body?.data === 'string' ? JSON.parse(res.body.data) : res?.body?.data;
      const face = data?.face?.data || data?.data?.face || {};
      const back = data?.back?.data || data?.data?.back || {};
      return {
        name: face.name,
        gender: face.sex || face.gender,
        ethnicity: face.ethnicity,
        birthday: face.birthDate,
        idNumber: face.idNumber,
        address: face.address,
        issuingAuthority: back.issueAuthority,
        validFrom: (back.validPeriod || '').split('-')[0],
        validTo: (back.validPeriod || '').split('-')[1],
      };
    } finally {
      await fs.promises.unlink(tmp).catch(() => undefined);
    }
  }
}