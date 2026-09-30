/** 认证驳回可选字段（与教师端表单对齐） */
export const CERT_REJECT_FIELD_OPTIONS = [
  { key: 'realName', label: '真实姓名', kind: 'text' as const },
  { key: 'idNumber', label: '身份证号', kind: 'text' as const },
  { key: 'email', label: '电子邮箱', kind: 'text' as const },
  { key: 'idCard', label: '身份证人像面', kind: 'file' as const },
  { key: 'idCardBack', label: '身份证国徽面', kind: 'file' as const },
  { key: 'diploma', label: '学历证明', kind: 'file' as const },
  { key: 'clearance', label: '无犯罪证明', kind: 'file' as const },
  { key: 'certificate', label: '教师资格证', kind: 'file' as const },
] as const;

export type CertRejectFieldKey = (typeof CERT_REJECT_FIELD_OPTIONS)[number]['key'];

const ALLOWED = new Set(CERT_REJECT_FIELD_OPTIONS.map((item) => item.key));

export function normalizeRejectFields(input?: string[] | string | null): CertRejectFieldKey[] {
  let list: unknown[] = [];
  if (Array.isArray(input)) list = input;
  else if (typeof input === 'string' && input.trim()) {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = input.split(/[,，\s]+/).filter(Boolean);
    }
  }
  const out: CertRejectFieldKey[] = [];
  for (const raw of list) {
    const key = String(raw || '').trim() as CertRejectFieldKey;
    if (ALLOWED.has(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

export function serializeRejectFields(fields: string[] | null | undefined) {
  const list = normalizeRejectFields(fields || []);
  return list.length ? JSON.stringify(list) : null;
}

export function rejectFieldLabels(fields: string[] | null | undefined) {
  const set = new Set(normalizeRejectFields(fields || []));
  return CERT_REJECT_FIELD_OPTIONS.filter((item) => set.has(item.key)).map((item) => item.label);
}
