import { createHmac, timingSafeEqual } from 'crypto';
import type { PrismaService } from '@/common/prisma/prisma.service';

/** 财务密码解锁凭证：前端放在请求头里，过期或财务密码被修改后失效 */
export const FINANCE_TOKEN_HEADER = 'x-finance-token';
export const FINANCE_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
/** 剩余时间少于这个值时，任一后台接口响应顺带下发新凭证（相当于后台 2 小时无操作才过期） */
const RENEW_BELOW_MS = FINANCE_TOKEN_TTL_MS - 5 * 60 * 1000;

/** 全员共用的财务密码：{ hash: bcrypt, at: 设置时间戳（作为凭证版本） } */
export const FINANCE_PIN_KEY = 'finance_pin';
export type SharedFinancePin = { hash: string; at: number };

const CACHE_MS = 5_000;
let cached: { loadedAt: number; value: SharedFinancePin | null } | null = null;

export async function loadSharedFinancePin(prisma: PrismaService): Promise<SharedFinancePin | null> {
  if (cached && Date.now() - cached.loadedAt < CACHE_MS) return cached.value;
  const row = await prisma.appSetting.findUnique({ where: { key: FINANCE_PIN_KEY } });
  let value: SharedFinancePin | null = null;
  try {
    const data = row?.value ? JSON.parse(row.value) : null;
    if (data?.hash && Number(data.at) > 0) value = { hash: String(data.hash), at: Number(data.at) };
  } catch {
    value = null;
  }
  cached = { loadedAt: Date.now(), value };
  return value;
}

export function invalidateSharedFinancePin() {
  cached = null;
}

function signature(body: string) {
  return createHmac('sha256', `finance-pin:${process.env.JWT_SECRET || ''}`).update(body).digest('base64url');
}

export function issueFinanceToken(adminId: number, version: number) {
  const expiresAt = Date.now() + FINANCE_TOKEN_TTL_MS;
  const body = Buffer.from(JSON.stringify({ a: adminId, v: version, e: expiresAt })).toString('base64url');
  return { token: `${body}.${signature(body)}`, expiresAt };
}

export function readFinanceToken(token: string, adminId: number, version: number) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(signature(body));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (data.a !== adminId || data.v !== version || !(data.e > Date.now())) return null;
    return { expiresAt: Number(data.e), renew: Number(data.e) - Date.now() < RENEW_BELOW_MS };
  } catch {
    return null;
  }
}

export function isWeakFinancePin(pin: string) {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  return '0123456789'.includes(pin) || '9876543210'.includes(pin);
}
