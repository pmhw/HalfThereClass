import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { clientIp } from '@/common/security';

export type PrivateAuditCtx = {
  adminId?: number | null;
  adminName?: string;
  req?: { ip?: string; headers?: Record<string, any>; socket?: { remoteAddress?: string } };
};

const KIND_LABEL: Record<string, string> = {
  deposit_available: '可用余额划入',
  deposit_alloc: '流水归属划入',
  deposit_payout: '打款入账',
  adjust_plus: '增加项',
  adjust_minus: '扣除项',
  withdraw_available: '划出到可用余额',
  withdraw_alloc: '解除流水归属',
  out_alloc: '支出从私户扣除',
  out_alloc_undo: '解除支出私户扣除',
};

function yuan(cents: number) {
  return (cents / 100).toFixed(2);
}

function readFingerprint(req?: PrivateAuditCtx['req']) {
  return String(req?.headers?.['x-device-fingerprint'] || req?.headers?.['x-device-fp'] || '').trim().slice(0, 120);
}

function readUserAgent(req?: PrivateAuditCtx['req']) {
  return String(req?.headers?.['user-agent'] || '').trim().slice(0, 300);
}

@Injectable()
export class PrivateAccountService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const [accounts, allEntries, advances] = await Promise.all([
      this.prisma.financePrivateAccount.findMany({
        orderBy: [{ id: 'asc' }],
        include: { entries: { orderBy: { id: 'desc' }, take: 40 } },
      }),
      this.prisma.financePrivateEntry.findMany({
        select: { accountId: true, direction: true, amountCents: true },
      }),
      this.prisma.financeAdvance.findMany({
        where: { status: 'open' },
        select: { userId: true, name: true, amountCents: true },
      }),
    ]);
    const balMap = new Map<number, number>();
    for (const row of allEntries) {
      const delta = row.direction === 'in' ? row.amountCents : -row.amountCents;
      balMap.set(row.accountId, (balMap.get(row.accountId) || 0) + delta);
    }
    const advMap = new Map<string, number>();
    for (const row of advances) {
      const key = this.keyOf(row.userId, row.name);
      advMap.set(key, (advMap.get(key) || 0) + row.amountCents);
    }
    const list = accounts.map((row) => {
      const balanceCents = balMap.get(row.id) || 0;
      const advancedCents = advMap.get(this.keyOf(row.userId, row.name)) || 0;
      return this.presentAccount(row, balanceCents, advancedCents);
    }).filter((item) => item.balance > 0 || item.advanced > 0 || item.entries.length);
    list.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, 'zh'));
    const privateTotal = list.reduce((sum, item) => sum + item.balance, 0);
    return { list, privateTotal };
  }

  async getAccountDetail(id: number) {
    const row = await this.prisma.financePrivateAccount.findUnique({
      where: { id },
      include: { entries: { orderBy: { id: 'desc' }, take: 200 } },
    });
    if (!row) throw new NotFoundException('企业私户不存在');
    const [balanceCents, advancedCents] = await Promise.all([
      this.balanceCents(row.userId, row.name),
      this.advancedCents(row.userId, row.name),
    ]);
    return this.presentAccount(row, balanceCents, advancedCents);
  }

  /** 账户余额（导入）− 企业私户合计 = 当前可用 */
  async privateTotalCents() {
    const entries = await this.prisma.financePrivateEntry.findMany({
      select: { direction: true, amountCents: true },
    });
    return entries.reduce((sum, row) => sum + (row.direction === 'in' ? row.amountCents : -row.amountCents), 0);
  }

  async balanceCents(userId?: number | null, name?: string) {
    const account = await this.findAccount(userId, name);
    if (!account) return 0;
    const entries = await this.prisma.financePrivateEntry.findMany({
      where: { accountId: account.id },
      select: { direction: true, amountCents: true },
    });
    return this.balanceOf(entries);
  }

  async capacity(userId?: number | null, name?: string) {
    const uid = Number(userId) || null;
    const label = String(name || '').trim();
    const balanceCents = await this.balanceCents(uid, label);
    const advancedCents = await this.advancedCents(uid, label);
    return {
      userId: uid,
      name: label,
      balanceCents,
      advancedCents,
      withdrawableCents: Math.max(0, balanceCents - advancedCents),
      advanceableCents: Math.max(0, balanceCents - advancedCents),
    };
  }

  async ownerCaps() {
    const { list } = await this.list();
    return list.map((item) => ({
      accountId: item.id,
      userId: item.userId,
      name: item.name,
      locked: item.balance,
      balance: item.balance,
      advanced: item.advanced,
      advanceable: item.advanceable,
    }));
  }

  /** 从当前可用余额划入企业私户 */
  async depositFromAvailable(
    body: { userId?: number | null; name?: string; amount?: number; note?: string },
    availableCents: number | null,
    audit: PrivateAuditCtx = {},
  ) {
    const amountCents = this.parseAmount(body?.amount);
    const { userId, name } = await this.resolvePerson(body?.userId, body?.name);
    if (availableCents != null && amountCents > availableCents) {
      throw new BadRequestException(
        availableCents <= 0
          ? '当前可用余额为 0，无法划入企业私户'
          : `划入金额不能超过当前可用余额 ¥${yuan(availableCents)}`,
      );
    }
    const note = String(body?.note || '').trim().slice(0, 120);
    if (!note) throw new BadRequestException('请填写划入备注，便于记录清楚');
    const account = await this.ensureAccount(userId, name);
    const entry = await this.writeEntry({
      accountId: account.id,
      kind: 'deposit_available',
      direction: 'in',
      amountCents,
      note,
      detail: `从可用余额划入企业私户 ¥${yuan(amountCents)}（${name}）：${note}`,
      audit,
    });
    return this.entryResult(account, entry);
  }

  /** 流水归属锁定时同步入账（同 alloc 解除后再划入会再记一笔） */
  async creditFromAlloc(
    input: { userId?: number | null; name: string; amountCents: number; note?: string; bankAllocId: number; bankTxnId: number },
    audit: PrivateAuditCtx = {},
  ) {
    const account = await this.ensureAccount(input.userId || null, input.name);
    const related = await this.prisma.financePrivateEntry.findMany({
      where: { bankAllocId: input.bankAllocId, kind: { in: ['deposit_alloc', 'withdraw_alloc'] } },
      select: { direction: true, amountCents: true },
    });
    const net = related.reduce((sum, row) => sum + (row.direction === 'in' ? row.amountCents : -row.amountCents), 0);
    if (net >= input.amountCents) return related.find((row) => row.direction === 'in') || null;
    return this.writeEntry({
      accountId: account.id,
      kind: 'deposit_alloc',
      direction: 'in',
      amountCents: input.amountCents,
      note: input.note || '',
      bankAllocId: input.bankAllocId,
      bankTxnId: input.bankTxnId,
      detail: `流水归属划入企业私户 ¥${yuan(input.amountCents)}（${input.name}）`,
      audit,
    });
  }

  /** 解除流水归属时同步出账 */
  async debitFromAlloc(
    input: { userId?: number | null; name: string; amountCents: number; note?: string; bankAllocId: number; bankTxnId: number },
    audit: PrivateAuditCtx = {},
  ) {
    const cap = await this.capacity(input.userId, input.name);
    if (input.amountCents > cap.withdrawableCents) {
      throw new BadRequestException(
        `「${input.name}」企业私户可划出 ¥${yuan(cap.withdrawableCents)}（余额 ¥${yuan(cap.balanceCents)}，已提取垫付 ¥${yuan(cap.advancedCents)}），不足以解除 ¥${yuan(input.amountCents)}`,
      );
    }
    const account = await this.ensureAccount(input.userId || null, input.name);
    return this.writeEntry({
      accountId: account.id,
      kind: 'withdraw_alloc',
      direction: 'out',
      amountCents: input.amountCents,
      note: input.note || '',
      bankAllocId: input.bankAllocId,
      bankTxnId: input.bankTxnId,
      detail: `解除流水归属，企业私户划出 ¥${yuan(input.amountCents)}（${input.name}）`,
      audit,
    });
  }

  /** 支出流水：从企业私户扣除（私户可划出余额须足够） */
  async debitFromOutAlloc(
    input: { userId?: number | null; name: string; amountCents: number; note?: string; bankAllocId: number; bankTxnId: number },
    audit: PrivateAuditCtx = {},
  ) {
    const cap = await this.capacity(input.userId, input.name);
    if (cap.balanceCents <= 0) {
      throw new BadRequestException(`「${input.name}」企业私户余额为 0，无法从私户扣除支出`);
    }
    if (input.amountCents > cap.withdrawableCents) {
      throw new BadRequestException(
        `「${input.name}」企业私户可扣 ¥${yuan(cap.withdrawableCents)}（余额 ¥${yuan(cap.balanceCents)}，已提取垫付 ¥${yuan(cap.advancedCents)}），不足以扣除 ¥${yuan(input.amountCents)}`,
      );
    }
    const account = await this.ensureAccount(input.userId || null, input.name);
    const related = await this.prisma.financePrivateEntry.findMany({
      where: { bankAllocId: input.bankAllocId, kind: { in: ['out_alloc', 'out_alloc_undo'] } },
      select: { direction: true, amountCents: true },
    });
    const netOut = related.reduce((sum, row) => sum + (row.direction === 'out' ? row.amountCents : -row.amountCents), 0);
    if (netOut >= input.amountCents) return related.find((row) => row.direction === 'out') || null;
    return this.writeEntry({
      accountId: account.id,
      kind: 'out_alloc',
      direction: 'out',
      amountCents: input.amountCents,
      note: input.note || '',
      bankAllocId: input.bankAllocId,
      bankTxnId: input.bankTxnId,
      detail: `支出流水从企业私户扣除 ¥${yuan(input.amountCents)}（${input.name}）`,
      audit,
    });
  }

  /** 解除「支出从私户扣除」：金额退回该企业私户 */
  async creditFromOutAllocUnlock(
    input: { userId?: number | null; name: string; amountCents: number; note?: string; bankAllocId: number; bankTxnId: number },
    audit: PrivateAuditCtx = {},
  ) {
    const account = await this.ensureAccount(input.userId || null, input.name);
    const related = await this.prisma.financePrivateEntry.findMany({
      where: { bankAllocId: input.bankAllocId, kind: { in: ['out_alloc', 'out_alloc_undo'] } },
      select: { direction: true, amountCents: true },
    });
    const netOut = related.reduce((sum, row) => sum + (row.direction === 'out' ? row.amountCents : -row.amountCents), 0);
    if (netOut <= 0) return related.find((row) => row.direction === 'in') || null;
    const amount = Math.min(input.amountCents, netOut);
    return this.writeEntry({
      accountId: account.id,
      kind: 'out_alloc_undo',
      direction: 'in',
      amountCents: amount,
      note: input.note || '',
      bankAllocId: input.bankAllocId,
      bankTxnId: input.bankTxnId,
      detail: `解除支出私户扣除，退回企业私户 ¥${yuan(amount)}（${input.name}）`,
      audit,
    });
  }

  /** 手工增加 / 扣除 */
  async adjust(
    body: { accountId?: number; userId?: number | null; name?: string; amount?: number; note?: string; direction?: 'plus' | 'minus' },
    availableCents: number | null,
    audit: PrivateAuditCtx = {},
  ) {
    const amountCents = this.parseAmount(body?.amount);
    const plus = body?.direction !== 'minus';
    const note = String(body?.note || '').trim().slice(0, 120);
    if (!note) throw new BadRequestException('请填写增减备注，便于记录清楚');

    let account = body?.accountId
      ? await this.prisma.financePrivateAccount.findUnique({ where: { id: Number(body.accountId) } })
      : null;
    if (!account) {
      const person = await this.resolvePerson(body?.userId, body?.name);
      account = await this.ensureAccount(person.userId, person.name);
    }
    if (!account) throw new NotFoundException('企业私户不存在');

    if (plus) {
      if (availableCents != null && amountCents > availableCents) {
        throw new BadRequestException(`增加项不能超过当前可用余额 ¥${yuan(availableCents ?? 0)}`);
      }
      const entry = await this.writeEntry({
        accountId: account.id,
        kind: 'adjust_plus',
        direction: 'in',
        amountCents,
        note,
        detail: `增加项 ¥${yuan(amountCents)}（${account.name}）：${note}`,
        audit,
      });
      return this.entryResult(account, entry);
    }

    const cap = await this.capacity(account.userId, account.name);
    if (amountCents > cap.withdrawableCents) {
      throw new BadRequestException(
        `扣除后须仍覆盖已提取垫付。可扣除 ¥${yuan(cap.withdrawableCents)}（余额 ¥${yuan(cap.balanceCents)}，垫付 ¥${yuan(cap.advancedCents)}）`,
      );
    }
    const entry = await this.writeEntry({
      accountId: account.id,
      kind: 'adjust_minus',
      direction: 'out',
      amountCents,
      note,
      detail: `扣除项 ¥${yuan(amountCents)}（${account.name}）：${note}`,
      audit,
    });
    return this.entryResult(account, entry);
  }

  /** 从企业私户划出到可用余额 */
  async withdrawToAvailable(
    body: { accountId?: number; userId?: number | null; name?: string; amount?: number; note?: string },
    audit: PrivateAuditCtx = {},
  ) {
    const amountCents = this.parseAmount(body?.amount);
    let account = body?.accountId
      ? await this.prisma.financePrivateAccount.findUnique({ where: { id: Number(body.accountId) } })
      : null;
    if (!account) {
      const person = await this.resolvePerson(body?.userId, body?.name);
      account = await this.ensureAccount(person.userId, person.name);
    }
    if (!account) throw new NotFoundException('企业私户不存在');
    const cap = await this.capacity(account.userId, account.name);
    if (amountCents > cap.withdrawableCents) {
      throw new BadRequestException(
        `可划出 ¥${yuan(cap.withdrawableCents)}（余额 ¥${yuan(cap.balanceCents)}，已提取垫付 ¥${yuan(cap.advancedCents)}）`,
      );
    }
    const note = String(body?.note || '').trim().slice(0, 120);
    const entry = await this.writeEntry({
      accountId: account.id,
      kind: 'withdraw_available',
      direction: 'out',
      amountCents,
      note,
      detail: `企业私户划出到可用余额 ¥${yuan(amountCents)}（${account.name}）`,
      audit,
    });
    return this.entryResult(account, entry);
  }

  /** 打款入账到企业私户（批量） */
  async creditPayouts(
    month: string,
    items: { key: string; userId?: number | null; name: string; amountCents: number }[],
    availableCents: number | null,
    audit: PrivateAuditCtx = {},
  ) {
    const need = items.reduce((sum, item) => sum + item.amountCents, 0);
    if (availableCents != null && need > availableCents) {
      throw new BadRequestException(
        `打入企业私户合计 ¥${yuan(need)}，超过当前可用余额 ¥${yuan(availableCents)}。请减少人选或先增加可用余额`,
      );
    }
    const created: any[] = [];
    for (const item of items) {
      if (item.amountCents <= 0) continue;
      const account = await this.ensureAccount(item.userId || null, item.name);
      const entry = await this.writeEntry({
        accountId: account.id,
        kind: 'deposit_payout',
        direction: 'in',
        amountCents: item.amountCents,
        payoutMonth: month,
        payoutKey: item.key,
        detail: `${month} 打款入账企业私户 ¥${yuan(item.amountCents)}（${item.name}）`,
        audit,
      });
      created.push({ accountId: account.id, entryId: entry.id, name: item.name, amount: item.amountCents / 100, key: item.key });
    }
    return created;
  }

  /** 撤销打款入账 */
  async refundPayouts(month: string, keys: string[], audit: PrivateAuditCtx = {}) {
    const rows = await this.prisma.financePrivateEntry.findMany({
      where: { payoutMonth: month, payoutKey: { in: keys }, kind: 'deposit_payout', direction: 'in' },
      include: { account: true },
    });
    const reversed: any[] = [];
    for (const row of rows) {
      const entry = await this.writeEntry({
        accountId: row.accountId,
        kind: 'withdraw_available',
        direction: 'out',
        amountCents: row.amountCents,
        note: `撤销 ${month} 打款入账`,
        payoutMonth: month,
        payoutKey: row.payoutKey,
        detail: `撤销打款入账，企业私户划出 ¥${yuan(row.amountCents)}（${row.account.name}）`,
        audit,
      });
      reversed.push({ entryId: entry.id, name: row.account.name, amount: row.amountCents / 100 });
    }
    return reversed;
  }

  private balanceOf(entries: { direction: string; amountCents: number }[]) {
    return entries.reduce((sum, row) => sum + (row.direction === 'in' ? row.amountCents : -row.amountCents), 0);
  }

  private keyOf(userId: number | null | undefined, name: string) {
    return userId ? `u:${userId}` : `n:${String(name || '').trim()}`;
  }

  private async advancedCents(userId?: number | null, name?: string) {
    const uid = Number(userId) || null;
    const label = String(name || '').trim();
    const where = uid
      ? { status: 'open' as const, OR: [{ userId: uid }, { userId: null, name: label }] }
      : { status: 'open' as const, name: label };
    const advances = await this.prisma.financeAdvance.findMany({ where, select: { amountCents: true } });
    return advances.reduce((sum, row) => sum + row.amountCents, 0);
  }

  private async findAccount(userId?: number | null, name?: string) {
    const uid = Number(userId) || null;
    const label = String(name || '').trim();
    if (uid) {
      const byUser = await this.prisma.financePrivateAccount.findFirst({ where: { userId: uid } });
      if (byUser) return byUser;
    }
    if (label) {
      return this.prisma.financePrivateAccount.findFirst({
        where: uid ? { userId: null, name: label } : { name: label },
      });
    }
    return null;
  }

  async ensureAccount(userId: number | null, name: string) {
    const existing = await this.findAccount(userId, name);
    if (existing) {
      if (userId && !existing.userId) {
        return this.prisma.financePrivateAccount.update({ where: { id: existing.id }, data: { userId } });
      }
      if (name && existing.name !== name && userId && existing.userId === userId) {
        return this.prisma.financePrivateAccount.update({ where: { id: existing.id }, data: { name } });
      }
      return existing;
    }
    return this.prisma.financePrivateAccount.create({
      data: { userId, name: String(name || '').trim() || '未命名' },
    });
  }

  private async resolvePerson(userId?: number | null, name?: string) {
    const uid = Number(userId) || null;
    let label = String(name || '').trim();
    if (uid) {
      const user = await this.prisma.user.findUnique({
        where: { id: uid },
        select: { id: true, nickname: true, teacherCert: { select: { realName: true } } },
      });
      if (!user) throw new BadRequestException('所选人员不存在');
      label = user.teacherCert?.realName || user.nickname || `用户${user.id}`;
    }
    if (!label) throw new BadRequestException('请选择或填写企业私户所属人员');
    if (label.length > 40) throw new BadRequestException('人员姓名过长');
    return { userId: uid, name: label };
  }

  private parseAmount(amount?: number) {
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) throw new BadRequestException('请填写大于 0 的金额');
    return amountCents;
  }

  private async writeEntry(input: {
    accountId: number;
    kind: string;
    direction: 'in' | 'out';
    amountCents: number;
    note?: string;
    bankAllocId?: number | null;
    bankTxnId?: number | null;
    payoutMonth?: string;
    payoutKey?: string;
    detail: string;
    audit: PrivateAuditCtx;
  }) {
    return this.prisma.financePrivateEntry.create({
      data: {
        accountId: input.accountId,
        kind: input.kind,
        direction: input.direction,
        amountCents: input.amountCents,
        note: String(input.note || '').trim().slice(0, 120),
        bankAllocId: input.bankAllocId || null,
        bankTxnId: input.bankTxnId || null,
        payoutMonth: input.payoutMonth || '',
        payoutKey: input.payoutKey || '',
        adminId: input.audit.adminId || null,
        adminName: String(input.audit.adminName || '').trim().slice(0, 40),
        ip: clientIp(input.audit.req as any) || '',
        userAgent: readUserAgent(input.audit.req),
        fingerprint: readFingerprint(input.audit.req),
        detail: input.detail,
      },
    });
  }

  private async entryResult(account: { id: number; userId: number | null; name: string }, entry: any) {
    const balanceCents = await this.balanceCents(account.userId, account.name);
    return {
      accountId: account.id,
      userId: account.userId,
      name: account.name,
      balance: balanceCents / 100,
      entry: this.presentEntry(entry),
    };
  }

  private presentAccount(
    row: { id: number; userId: number | null; name: string; createdAt: Date; entries?: any[] },
    balanceCents: number,
    advancedCents: number,
  ) {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      balance: balanceCents / 100,
      advanced: advancedCents / 100,
      advanceable: Math.max(0, balanceCents - advancedCents) / 100,
      withdrawable: Math.max(0, balanceCents - advancedCents) / 100,
      createdAt: row.createdAt,
      entries: (row.entries || []).map((item) => this.presentEntry(item)),
    };
  }

  private presentEntry(row: any) {
    return {
      id: row.id,
      kind: row.kind,
      kindLabel: KIND_LABEL[row.kind] || row.kind,
      direction: row.direction,
      amount: row.amountCents / 100,
      note: row.note || '',
      bankAllocId: row.bankAllocId,
      bankTxnId: row.bankTxnId,
      payoutMonth: row.payoutMonth || '',
      payoutKey: row.payoutKey || '',
      adminName: row.adminName || '',
      ip: row.ip || '',
      fingerprint: row.fingerprint || '',
      detail: row.detail || '',
      createdAt: row.createdAt,
    };
  }
}
