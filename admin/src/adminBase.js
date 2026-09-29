/**
 * 管理后台入口路径（生产为 /{12位随机}/，开发可为 /）
 * 必须与后端 ADMIN_ENTRY 一致；由当前 URL 首段解析。
 */
export function adminBase() {
  if (typeof window === 'undefined') return '/';
  const seg = window.location.pathname.split('/').filter(Boolean)[0] || '';
  if (/^[a-z0-9]{12}$/i.test(seg)) return `/${seg.toLowerCase()}/`;
  // Vite 本地开发仍走根路径
  if (import.meta.env.DEV) return '/';
  return '/';
}

/** 拼到后台入口下的绝对路径（用于 location 硬跳转） */
export function withAdminBase(path = '/') {
  const base = adminBase().replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!base) return normalized;
  return `${base}${normalized}`;
}

export function adminEntryUrl() {
  if (typeof window === 'undefined') return '';
  const base = adminBase();
  return `${window.location.origin}${base}`;
}
