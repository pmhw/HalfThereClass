import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PopCore = require('@alicloud/pop-core');
import { PrismaService } from '@/common/prisma/prisma.service';
import { clientIp, isMaskedSecret, maskSecret, rateLimit } from '@/common/security';

const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const CODE_FILE = join(tmpdir(), 'halfthere-sms-codes.json');
const BALANCE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_LOW_THRESHOLD = 200;
const DEFAULT_LOW_BALANCE = 20;

const SMS_KEYS = [
  'smsEnabled',
  'smsAccessKeyId',
  'smsAccessKeySecret',
  'smsSignName',
  'smsTemplateCode',
  'smsTemplateParam',
  'smsLowThreshold',
  'smsLowBalance',
] as const;

type SmsTicket = { codeHash: string; expires: number; sentAt: number; tries: number };

type SmsRuntimeConfig = {
  enabled: boolean;
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
  templateParam: string;
  /** 资源包剩余条数低于此值时提醒 */
  lowThreshold: number;
  /** 无资源包（按量付费）时，账户可用余额低于此值（元）提醒 */
  lowBalance: number;
};

export type SmsPackage = {
  instanceId: string;
  name: string;
  status: string;
  total: number | null;
  remaining: number | null;
  unit: string;
  expiryTime: string | null;
};

export type SmsBalance = {
  enabled: boolean;
  configured: boolean;
  /** 资源包接口至少成功调用过一次 */
  packagesQueried: boolean;
  packages: SmsPackage[];
  /** 未识别为短信的其它资源包（用于核对阿里云的归类） */
  otherPackages: { name: string; commodityCode: string; packageType: string; remaining: number | null; unit: string }[];
  remaining: number | null;
  total: number | null;
  accountBalance: number | null;
  currency: string;
  threshold: number;
  balanceThreshold: number;
  low: boolean;
  lowMessage: string;
  error: string;
  checkedAt: string;
};

function toAmount(value: unknown) {
  if (value == null || value === '') return null;
  const num = Number(String(value).replace(/[,\s]/g, ''));
  return Number.isFinite(num) ? num : null;
}

function toNonNegative(value: unknown, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function loadStore() {
  const map = new Map<string, SmsTicket>();
  try {
    const raw = JSON.parse(readFileSync(CODE_FILE, 'utf8')) as Record<string, SmsTicket>;
    const now = Date.now();
    for (const [phone, item] of Object.entries(raw || {})) {
      if (item && item.expires > now) map.set(phone, item);
    }
  } catch {
    /* empty */
  }
  return map;
}

function saveStore(map: Map<string, SmsTicket>) {
  const data: Record<string, SmsTicket> = {};
  const now = Date.now();
  for (const [phone, item] of map) {
    if (item.expires > now) data[phone] = item;
  }
  writeFileSync(CODE_FILE, JSON.stringify(data));
}

function hashCode(phone: string, code: string) {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

export function normalizeCnPhone(input: string) {
  const phone = String(input || '').trim().replace(/\s+/g, '');
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    throw new BadRequestException('请输入正确的手机号');
  }
  return phone;
}

@Injectable()
export class SmsService {
  private balanceCache: { at: number; data: SmsBalance } | null = null;

  constructor(private prisma: PrismaService) {}

  async getAdminConfig() {
    const cfg = await this.loadRuntimeConfig();
    return {
      enabled: cfg.enabled,
      accessKeyId: cfg.accessKeyId,
      accessKeySecret: maskSecret(cfg.accessKeySecret),
      hasSecret: Boolean(cfg.accessKeySecret),
      signName: cfg.signName,
      templateCode: cfg.templateCode,
      templateParam: cfg.templateParam || 'code',
      lowThreshold: cfg.lowThreshold,
      lowBalance: cfg.lowBalance,
      ready: this.isReady(cfg),
    };
  }

  async saveAdminConfig(data: {
    enabled?: boolean | string | number;
    accessKeyId?: string;
    accessKeySecret?: string;
    signName?: string;
    templateCode?: string;
    templateParam?: string;
    lowThreshold?: number | string;
    lowBalance?: number | string;
  }) {
    const current = await this.loadRuntimeConfig();
    const accessKeyId = String(data.accessKeyId ?? current.accessKeyId ?? '').trim();
    let accessKeySecret = String(data.accessKeySecret ?? '').trim();
    if (isMaskedSecret(accessKeySecret)) accessKeySecret = current.accessKeySecret;
    const signName = String(data.signName ?? current.signName ?? '').trim();
    const templateCode = String(data.templateCode ?? current.templateCode ?? '').trim();
    const templateParam = String(data.templateParam ?? current.templateParam ?? 'code').trim() || 'code';
    const enabled =
      data.enabled === true ||
      data.enabled === 1 ||
      data.enabled === '1' ||
      data.enabled === 'true' ||
      data.enabled === 'on';

    if (enabled) {
      if (!accessKeyId) throw new BadRequestException('请填写 AccessKey ID');
      if (!accessKeySecret) throw new BadRequestException('请填写 AccessKey Secret');
      if (!signName) throw new BadRequestException('请填写短信签名');
      if (!templateCode) throw new BadRequestException('请填写模板 CODE');
    }

    const lowThreshold = Math.floor(toNonNegative(data.lowThreshold ?? current.lowThreshold, DEFAULT_LOW_THRESHOLD));
    const lowBalance = Math.round(toNonNegative(data.lowBalance ?? current.lowBalance, DEFAULT_LOW_BALANCE) * 100) / 100;

    const rows: { key: string; value: string }[] = [
      { key: 'smsEnabled', value: enabled ? '1' : '0' },
      { key: 'smsAccessKeyId', value: accessKeyId },
      { key: 'smsAccessKeySecret', value: accessKeySecret },
      { key: 'smsSignName', value: signName },
      { key: 'smsTemplateCode', value: templateCode },
      { key: 'smsTemplateParam', value: templateParam },
      { key: 'smsLowThreshold', value: String(lowThreshold) },
      { key: 'smsLowBalance', value: String(lowBalance) },
    ];
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.appSetting.upsert({
          where: { key: row.key },
          create: row,
          update: { value: row.value },
        }),
      ),
    );
    this.balanceCache = null;
    return this.getAdminConfig();
  }

  /**
   * 短信剩余量：阿里云费用中心（BSS）资源包剩余条数 + 账户可用余额。
   * AccessKey 需额外授权 AliyunBSSReadOnlyAccess。
   */
  async getBalance(force = false): Promise<SmsBalance> {
    if (!force && this.balanceCache && Date.now() - this.balanceCache.at < BALANCE_TTL_MS) {
      return this.balanceCache.data;
    }
    const cfg = await this.loadRuntimeConfig();
    const base: SmsBalance = {
      enabled: cfg.enabled,
      configured: Boolean(cfg.accessKeyId && cfg.accessKeySecret),
      packagesQueried: false,
      packages: [],
      otherPackages: [],
      remaining: null,
      total: null,
      accountBalance: null,
      currency: 'CNY',
      threshold: cfg.lowThreshold,
      balanceThreshold: cfg.lowBalance,
      low: false,
      lowMessage: '',
      error: '',
      checkedAt: new Date().toISOString(),
    };
    if (!base.configured) {
      this.balanceCache = { at: Date.now(), data: base };
      return base;
    }

    const Client = PopCore.RPCClient || PopCore;
    const client = new Client({
      accessKeyId: cfg.accessKeyId,
      accessKeySecret: cfg.accessKeySecret,
      endpoint: 'https://business.aliyuncs.com',
      apiVersion: '2017-12-14',
    });
    const call = (action: string, params: Record<string, unknown> = {}) =>
      client.request(action, params, { method: 'POST', timeout: 10000 }) as Promise<any>;

    const errors: string[] = [];
    // 官方文档未给出短信的 ProductCode，按候选代码 + 全量资源包关键字双路识别
    const found = new Map<string, any>();
    const keep = (rows: any[]) => rows.forEach((row) => found.set(String(row.InstanceId || JSON.stringify(row)), row));
    let packagesQueried = false;
    for (const productCode of ['dysms', 'sms']) {
      try {
        keep(await this.queryPackages(call, { ProductCode: productCode }));
        packagesQueried = true;
      } catch (err: any) {
        if (!/InvalidParameter/i.test(String(err?.data?.Code || err?.code || ''))) errors.push(this.mapBssError(err));
      }
    }
    let others: any[] = [];
    try {
      const all = await this.queryPackages(call, {});
      packagesQueried = true;
      const isSms = (item: any) =>
        /短信|sms/i.test(
          [item.Remark, item.PackageType, item.CommodityCode, JSON.stringify(item.ApplicableProducts || '')].join(' '),
        );
      keep(all.filter(isSms));
      others = all.filter((item) => !found.has(String(item.InstanceId || JSON.stringify(item))));
    } catch (err) {
      errors.push(this.mapBssError(err));
    }
    const instances = [...found.values()];
    base.packagesQueried = packagesQueried;
    base.otherPackages = others.slice(0, 20).map((item) => ({
      name: String(item.Remark || item.PackageType || item.InstanceId || ''),
      commodityCode: String(item.CommodityCode || ''),
      packageType: String(item.PackageType || ''),
      remaining: toAmount(item.RemainingAmount),
      unit: String(item.RemainingAmountUnit || ''),
    }));

    try {
      const res = await call('QueryAccountBalance');
      base.accountBalance = toAmount(res?.Data?.AvailableAmount ?? res?.Data?.AvailableCashAmount);
      base.currency = String(res?.Data?.Currency || 'CNY');
    } catch (err) {
      errors.push(this.mapBssError(err));
    }

    const now = Date.now();
    base.packages = instances.map((item) => ({
      instanceId: String(item.InstanceId || ''),
      name: String(item.Remark || item.PackageType || '短信资源包'),
      status: String(item.Status || ''),
      total: toAmount(item.TotalAmount),
      remaining: toAmount(item.RemainingAmount),
      unit: String(item.RemainingAmountUnit || item.TotalAmountUnit || '条'),
      expiryTime: item.ExpiryTime ? String(item.ExpiryTime) : null,
    }));
    const active = base.packages.filter((pkg) => {
      if (/expire|invalid|exhaust|release|失效|过期|用完/i.test(pkg.status)) return false;
      const expiry = pkg.expiryTime ? new Date(pkg.expiryTime).getTime() : NaN;
      return Number.isNaN(expiry) || expiry > now;
    });
    if (active.length) {
      base.remaining = active.reduce((sum, pkg) => sum + (pkg.remaining || 0), 0);
      base.total = active.reduce((sum, pkg) => sum + (pkg.total || 0), 0);
    }

    if (cfg.enabled) {
      const balanceLow = base.accountBalance != null && base.accountBalance < cfg.lowBalance;
      if (active.length && (base.remaining ?? 0) < cfg.lowThreshold) {
        base.low = true;
        base.lowMessage = `短信资源包仅剩 ${base.remaining} 条（提醒阈值 ${cfg.lowThreshold} 条）`;
        if (balanceLow) base.lowMessage += `，账户余额 ¥${base.accountBalance!.toFixed(2)} 也不足`;
      } else if (!active.length && balanceLow) {
        base.low = true;
        base.lowMessage = `没有可用的短信资源包，账户余额仅 ¥${base.accountBalance!.toFixed(2)}（提醒阈值 ¥${cfg.lowBalance}）`;
      }
    }
    base.error = [...new Set(errors)].join('；');
    this.balanceCache = { at: Date.now(), data: base };
    return base;
  }

  private async queryPackages(call: (action: string, params?: Record<string, unknown>) => Promise<any>, extra: Record<string, unknown>) {
    const list: any[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const res = await call('QueryResourcePackageInstances', { ...extra, PageNum: page, PageSize: 100 });
      if (res?.Success === false) throw Object.assign(new Error(res?.Message || '查询资源包失败'), { code: res?.Code });
      const rows = res?.Data?.Instances?.Instance || [];
      list.push(...rows);
      const totalCount = Number(res?.Data?.TotalCount || 0);
      if (!rows.length || list.length >= totalCount) break;
    }
    return list;
  }

  private mapBssError(err: any) {
    const code = String(err?.data?.Code || err?.code || '');
    const message = String(err?.data?.Message || err?.message || err || '');
    if (/NotAuthorized|Forbidden|NoPermission|无权限|not authorized/i.test(code + message)) {
      return 'AccessKey 没有费用中心查询权限，请在 RAM 授权 AliyunBSSReadOnlyAccess';
    }
    if (/InvalidAccessKey|SignatureDoesNotMatch/i.test(code + message)) return 'AccessKey ID 或 Secret 不正确';
    if (/timeout|ETIMEDOUT|ECONN|ENOTFOUND/i.test(code + message)) return '连接阿里云费用中心超时，请稍后重试';
    return message ? `查询失败：${message}` : '查询失败';
  }

  async getStatus() {
    const cfg = await this.loadRuntimeConfig();
    return { enabled: cfg.enabled, ready: this.isReady(cfg) };
  }

  async sendLoginCode(
    phoneRaw: string,
    req?: { ip?: string; headers?: Record<string, any>; socket?: { remoteAddress?: string } },
  ) {
    const phone = normalizeCnPhone(phoneRaw);
    const ip = clientIp(req);
    rateLimit(`sms-send-ip:${ip}`, 20, 60 * 60 * 1000);
    rateLimit(`sms-send-phone:${phone}`, 8, 60 * 60 * 1000);

    const cfg = await this.loadRuntimeConfig();
    if (!cfg.enabled) throw new ServiceUnavailableException('短信登录尚未开启，请在后台配置阿里云短信');
    if (!this.isReady(cfg)) throw new ServiceUnavailableException('短信服务未配置完整，请在后台「系统设置 → 短信」填写');

    const store = loadStore();
    const prev = store.get(phone);
    const now = Date.now();
    if (prev && now - prev.sentAt < RESEND_MS) {
      const wait = Math.ceil((RESEND_MS - (now - prev.sentAt)) / 1000);
      throw new BadRequestException(`请 ${wait} 秒后再获取验证码`);
    }

    const code = String(randomInt(100000, 999999));
    await this.dispatchAliyun(cfg, phone, code);

    store.set(phone, {
      codeHash: hashCode(phone, code),
      expires: now + CODE_TTL_MS,
      sentAt: now,
      tries: 0,
    });
    saveStore(store);

    if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_SMS === '1') {
      console.warn(`[sms] ${phone} 验证码已发送（调试可见）: ${code}`);
    }

    return { ok: true, cooldown: Math.floor(RESEND_MS / 1000), expireIn: Math.floor(CODE_TTL_MS / 1000) };
  }

  consumeLoginCode(phoneRaw: string, codeRaw: string) {
    const phone = normalizeCnPhone(phoneRaw);
    const code = String(codeRaw || '').trim();
    if (!/^\d{4,8}$/.test(code)) throw new BadRequestException('验证码不正确');

    const store = loadStore();
    const item = store.get(phone);
    if (!item || item.expires < Date.now()) {
      store.delete(phone);
      saveStore(store);
      throw new BadRequestException('验证码已过期，请重新获取');
    }
    item.tries += 1;
    if (item.tries > 8) {
      store.delete(phone);
      saveStore(store);
      throw new BadRequestException('验证码错误次数过多，请重新获取');
    }
    if (item.codeHash !== hashCode(phone, code)) {
      saveStore(store);
      throw new BadRequestException('验证码不正确');
    }
    store.delete(phone);
    saveStore(store);
    return phone;
  }

  private isReady(cfg: SmsRuntimeConfig) {
    return Boolean(cfg.enabled && cfg.accessKeyId && cfg.accessKeySecret && cfg.signName && cfg.templateCode);
  }

  private async loadRuntimeConfig(): Promise<SmsRuntimeConfig> {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: [...SMS_KEYS] } },
    });
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const pick = (dbKey: string, envKey: string) => {
      const fromDb = String(map[dbKey] || '').trim();
      if (fromDb && !/your-|CHANGE_ME/i.test(fromDb)) return fromDb;
      const fromEnv = String(process.env[envKey] || '').trim();
      if (fromEnv && !/your-|CHANGE_ME/i.test(fromEnv)) return fromEnv;
      return '';
    };
    const enabledRaw = pick('smsEnabled', 'SMS_ENABLED');
    const enabled = enabledRaw === '1' || enabledRaw.toLowerCase() === 'true' || enabledRaw === 'on';
    return {
      enabled,
      accessKeyId: pick('smsAccessKeyId', 'SMS_ACCESS_KEY_ID'),
      accessKeySecret: pick('smsAccessKeySecret', 'SMS_ACCESS_KEY_SECRET'),
      signName: pick('smsSignName', 'SMS_SIGN_NAME'),
      templateCode: pick('smsTemplateCode', 'SMS_TEMPLATE_CODE'),
      templateParam: pick('smsTemplateParam', 'SMS_TEMPLATE_PARAM') || 'code',
      lowThreshold: toNonNegative(pick('smsLowThreshold', 'SMS_LOW_THRESHOLD') || DEFAULT_LOW_THRESHOLD, DEFAULT_LOW_THRESHOLD),
      lowBalance: toNonNegative(pick('smsLowBalance', 'SMS_LOW_BALANCE') || DEFAULT_LOW_BALANCE, DEFAULT_LOW_BALANCE),
    };
  }

  private async dispatchAliyun(cfg: SmsRuntimeConfig, phone: string, code: string) {
    const Client = PopCore.RPCClient || PopCore;
    const client = new Client({
      accessKeyId: cfg.accessKeyId,
      accessKeySecret: cfg.accessKeySecret,
      endpoint: 'https://dysmsapi.aliyuncs.com',
      apiVersion: '2017-05-25',
    });
    // 签名不要带【】；模板变量名须与控制台完全一致（常见 code）
    const signName = String(cfg.signName || '')
      .trim()
      .replace(/^[【\[]+/, '')
      .replace(/[】\]]+$/, '');
    const paramKey = String(cfg.templateParam || 'code').trim() || 'code';
    const templateCode = String(cfg.templateCode || '').trim();

    let result: { Code?: string; Message?: string; BizId?: string; RequestId?: string };
    try {
      result = (await client.request(
        'SendSms',
        {
          PhoneNumbers: phone,
          SignName: signName,
          TemplateCode: templateCode,
          TemplateParam: JSON.stringify({ [paramKey]: code }),
        },
        { method: 'POST' },
      )) as typeof result;
    } catch (err: any) {
      const message = String(err?.data?.Message || err?.message || err || '短信发送失败');
      const codeName = String(err?.data?.Code || err?.code || '');
      console.error(`[sms] 调用阿里云失败 phone=${phone} code=${codeName} msg=${message}`);
      throw new BadRequestException(this.mapAliyunError(codeName, message));
    }

    const ok = String(result?.Code || '').toUpperCase() === 'OK';
    if (!ok) {
      console.error(`[sms] 阿里云拒绝 phone=${phone} code=${result?.Code} msg=${result?.Message} req=${result?.RequestId}`);
      throw new BadRequestException(this.mapAliyunError(result?.Code, result?.Message));
    }

    // Code=OK 只表示受理成功；是否送达看控制台「发送记录」+ BizId
    console.warn(
      `[sms] 已受理 phone=${phone} bizId=${result?.BizId || '-'} requestId=${result?.RequestId || '-'} sign=${signName} template=${templateCode} param=${paramKey}`,
    );
  }

  private mapAliyunError(code?: string, message?: string) {
    const c = String(code || '');
    const m = String(message || '短信发送失败');
    if (/FREQUENCY|限流|频率/i.test(c + m)) return '发送太频繁，请稍后再试';
    if (/MOBILE_NUMBER_ILLEGAL|手机号/i.test(c + m)) return '手机号格式不正确或无法发送';
    if (/AMOUNT|BALANCE|余额|欠费/i.test(c + m)) return '阿里云短信余额不足，请先充值';
    if (/SIGNATURE|签名/i.test(c + m)) return '短信签名未通过或不匹配，请核对后台「短信签名」（不要加【】）';
    if (/TEMPLATE|模板/i.test(c + m)) return '短信模板未通过、CODE 错误或变量名不匹配（默认变量名 code）';
    if (/PERMISSION|Unauthorized|无权限/i.test(c + m)) return 'AccessKey 无短信发送权限，请授权 AliyunDysmsFullAccess';
    if (/InvalidAccessKey|SignatureDoesNotMatch/i.test(c + m)) return 'AccessKey ID 或 Secret 不正确';
    return m.includes('短信发送失败') ? m : `短信发送失败：${m}`;
  }
}
