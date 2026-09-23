import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';

const WEAK_PASSWORDS = new Set([
  'admin123',
  'admin',
  'password',
  'password123',
  '123456',
  '12345678',
  'qwerty',
  'changeme',
  'change_me',
  'change-me',
]);

const WEAK_JWT = new Set([
  '',
  'your-jwt-secret-key',
  'change_me',
  'changeme',
  'secret',
  'jwt-secret',
]);

const rateBuckets = new Map<string, { count: number; reset: number }>();

export function isWeakPassword(password: string) {
  const text = String(password || '');
  if (text.length < 10) return true;
  if (WEAK_PASSWORDS.has(text.toLowerCase())) return true;
  if (/^(.)\1+$/.test(text)) return true;
  return false;
}

export function assertStrongPassword(password: string, label = '密码') {
  if (isWeakPassword(password)) {
    throw new BadRequestException(`${label}至少 10 位，且不能使用常见弱口令`);
  }
}

export function isWeakJwtSecret(secret?: string | null) {
  const text = String(secret || '').trim();
  if (WEAK_JWT.has(text.toLowerCase())) return true;
  if (text.length < 32) return true;
  if (/your-|change.?me|example|placeholder/i.test(text)) return true;
  return false;
}

export function assertJwtSecretConfigured() {
  const secret = process.env.JWT_SECRET;
  const production = process.env.NODE_ENV === 'production';
  if (isWeakJwtSecret(secret)) {
    const message =
      'JWT_SECRET 未配置或过于弱。请在 backend/.env 设置至少 32 位随机字符串（可用 openssl rand -base64 48）。';
    if (production) {
      console.error(message);
      process.exit(1);
    }
    console.warn(`[安全警告] ${message}`);
  }
}

export function generateSecret(bytes = 36) {
  return randomBytes(bytes).toString('base64url');
}

export function generatePassword(bytes = 12) {
  return randomBytes(bytes).toString('base64url');
}

export function maskSecret(value?: string | null) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= 4) return '********';
  return `********${text.slice(-4)}`;
}

export function isMaskedSecret(value?: string | null) {
  const text = String(value || '').trim();
  return !text || text.startsWith('********') || /your-/i.test(text);
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.reset <= now) {
    bucket = { count: 0, reset: now + windowMs };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new BadRequestException('请求过于频繁，请稍后再试');
  }
}

export function clientIp(req?: { ip?: string; headers?: Record<string, any>; socket?: { remoteAddress?: string } }) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwarded || req?.ip || req?.socket?.remoteAddress || 'unknown';
}
