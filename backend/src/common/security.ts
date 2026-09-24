import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

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

function resolveEnvPath() {
  const candidates = [
    join(process.cwd(), '.env'),
    join(process.cwd(), 'backend', '.env'),
    join(process.cwd(), '..', 'backend', '.env'),
  ];
  return candidates.find((file) => existsSync(file)) || candidates[0];
}

function persistEnvKv(file: string, key: string, value: string) {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    text = '';
  }
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=`, 'm').test(text)) {
    text = text.replace(new RegExp(`^${key}=.*$`, 'm'), line);
  } else {
    text = `${text.replace(/\s*$/, '')}\n${line}\n`;
  }
  writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 });
}

/**
 * 启动时保证 JWT_SECRET 可用：弱/缺失则自动生成并写入 .env，绝不因此退出。
 * 已存在的强密钥不会被覆盖。
 */
export function ensureJwtSecret() {
  if (!isWeakJwtSecret(process.env.JWT_SECRET)) {
    return process.env.JWT_SECRET as string;
  }

  const secret = generateSecret(36);
  process.env.JWT_SECRET = secret;

  const envPath = resolveEnvPath();
  try {
    const exampleCandidates = [
      join(process.cwd(), '.env.example'),
      join(process.cwd(), 'backend', '.env.example'),
      join(process.cwd(), '..', 'backend', '.env.example'),
    ];
    if (!existsSync(envPath)) {
      const example = exampleCandidates.find((file) => existsSync(file));
      if (example) {
        writeFileSync(envPath, readFileSync(example, 'utf8'), { encoding: 'utf8', mode: 0o600 });
      } else {
        writeFileSync(envPath, 'NODE_ENV=production\n', { encoding: 'utf8', mode: 0o600 });
      }
    }
    persistEnvKv(envPath, 'JWT_SECRET', secret);
    console.warn(`[安全] 已自动生成并写入强 JWT_SECRET → ${envPath}`);
    console.warn('[安全] 原登录态将失效，请重新登录后台与手机端。');
  } catch (err: any) {
    console.warn(`[安全] 已在内存中使用临时 JWT_SECRET，但写入 .env 失败: ${err?.message || err}`);
    console.warn('[安全] 请检查 backend/.env 写权限，否则重启后密钥会变化。');
  }

  return secret;
}

/** @deprecated 使用 ensureJwtSecret；保留兼容旧调用 */
export function assertJwtSecretConfigured() {
  ensureJwtSecret();
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
