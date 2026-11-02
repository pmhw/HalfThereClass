import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { clientIp } from '@/common/security';
import { parseSpdWorkbook } from './bank-import';
import { AdvanceService } from './advance.service';
import { PrivateAccountService } from './private-account.service';
import { ReserveService } from './reserve.service';

type Person = {
  id: number;
  name: string;
  nickname: string;
  phoneTail: string;
  role: string;
  bankAccount: string;
  bankAccountName: string;
};

export type BankAuditCtx = {
  adminId?: number | null;
  adminName?: string;
  req?: { ip?: string; headers?: Record<string, any>; socket?: { remoteAddress?: string } };
};

function yuan(cents: number) {
  return (cents / 100).toFixed(2);
}

function readFingerprint(req?: BankAuditCtx['req']) {
  return String(req?.headers?.['x-device-fingerprint'] || req?.headers?.['x-device-fp'] || '').trim().slice(0, 120);
}

function readUserAgent(req?: BankAuditCtx['req']) {
  return String(req?.headers?.['user-agent'] || '').trim().slice(0, 300);
}

@Injectable()
export class BankTxnService {
  constructor(
    private prisma: PrismaService,
    private advances: AdvanceService,
    private privateAccounts: PrivateAccountService,
    private reserves: ReserveService,
  ) {}

  async list() {
    const [txns, people, privateData, advances, reserveData] = await Promise.all([
      this.prisma.bankTxn.findMany({
        orderBy: [{ txnDate: 'desc' }, { txnTime: 'desc' }, { id: 'desc' }],
        include: {
          allocations: { orderBy: { id: 'asc' } },
          allocLogs: { orderBy: { id: 'desc' }, take: 30 },
        },
      }),
      this.people(),
      this.privateAccounts.list(),
      this.advances.list(),
      this.reserves.list(),
    ]);
    const snapshot = await this.balanceSnapshot(txns);
    return {
      txns: txns.map((txn) => this.present(txn, people)),
      people: people.map(({ bankAccount, bankAccountName, ...person }) => person),
      summary: snapshot,
      lockOwners: privateData.list.map((item) => ({
        accountId: item.id,
        userId: item.userId,
        name: item.name,
        locked: item.balance,
        balance: item.balance,
        advanced: item.advanced,
        advanceable: item.advanceable,
      })),
      privateAccounts: privateData.list,
      advances,
      reserves: reserveData,
    };
  }

  /** 账户余额 − 企业私户 − 对公预留 = 当前可用；私户逻辑不变 */
  private async balanceSnapshot(
    txns: {
      id: number;
      txnDate: string;
      txnTime: string;
      balanceCents: number | null;
    }[],
  ) {
    const latest = txns
      .filter((row) => row.balanceCents != null)
      .reduce<(typeof txns)[number] | null>((best, row) => {
        if (!best) return row;
        const byTime = row.txnDate.localeCompare(best.txnDate) || row.txnTime.localeCompare(best.txnTime);
        if (byTime > 0 || (byTime === 0 && row.id < best.id)) return row;
        return best;
      }, null);
    const statementBalance = latest?.balanceCents == null ? null : latest.balanceCents / 100;
    const [privateTotalCents, reserveTotalCents] = await Promise.all([
      this.privateAccounts.privateTotalCents(),
      this.reserves.reserveTotalCents(),
    ]);
    const lockedTotal = privateTotalCents / 100;
    const reserveTotal = reserveTotalCents / 100;
    const availableBalance = statementBalance == null
      ? null
      : Math.round((statementBalance - lockedTotal - reserveTotal) * 100) / 100;
    return {
      statementBalance,
      statementAt: latest ? `${latest.txnDate} ${latest.txnTime}` : null,
      lockedTotal,
      privateTotal: lockedTotal,
      reserveTotal,
      availableBalance,
    };
  }

  async availableBalanceCents() {
    const txns = await this.prisma.bankTxn.findMany({
      select: {
        id: true,
        txnDate: true,
        txnTime: true,
        balanceCents: true,
      },
    });
    const snap = await this.balanceSnapshot(txns);
    if (snap.availableBalance == null) return null;
    return Math.round(snap.availableBalance * 100);
  }

  async importWorkbook(buffer: Buffer) {
    let parsed: ReturnType<typeof parseSpdWorkbook>;
    try {
      parsed = parseSpdWorkbook(buffer);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : '无法解析交易查询表');
    }
    let inserted = 0;
    let skipped = 0;
    const createdIds: number[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const row of parsed.rows) {
        const exists = await tx.bankTxn.findUnique({
          where: {
            accountNo_serialNo_slipNo_txnDate_txnTime_direction_amountCents: {
              accountNo: row.accountNo,
              serialNo: row.serialNo,
              slipNo: row.slipNo,
              txnDate: row.txnDate,
              txnTime: row.txnTime,
              direction: row.direction,
              amountCents: row.amountCents,
            },
          },
          select: { id: true },
        });
        if (exists) {
          skipped += 1;
          continue;
        }
        const created = await tx.bankTxn.create({ data: row });
        createdIds.push(created.id);
        inserted += 1;
      }
    });

    let advanceMatched = 0;
    let advanceConfirmed = 0;
    let advancePending = 0;
    if (createdIds.length) {
      const fresh = await this.prisma.bankTxn.findMany({
        where: { id: { in: createdIds }, direction: 'in' },
        select: { id: true, direction: true, amountCents: true, counterName: true },
      });
      for (const txn of fresh) {
        const hit = await this.advances.matchInboundTxn(txn);
        advanceMatched += hit.matched;
        advanceConfirmed += hit.confirmed;
        advancePending += hit.pending;
      }
    }

    return {
      inserted,
      skipped,
      total: parsed.rows.length,
      accountNo: parsed.accountNo,
      accountName: parsed.accountName,
      advanceMatched,
      advanceConfirmed,
      advancePending,
    };
  }

  async allocate(
    txnId: number,
    body: { userId?: number | null; name?: string; amount?: number; note?: string; accountId?: number },
    audit: BankAuditCtx = {},
  ) {
    const amountCents = Math.round(Number(body?.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) throw new BadRequestException('请填写大于 0 的归属金额');
    const people = await this.people();
    let userId = Number(body?.userId) || null;
    let name = String(body?.name || '').trim();
    const accountId = Number(body?.accountId) || null;
    if (accountId) {
      const acc = await this.prisma.financePrivateAccount.findUnique({ where: { id: accountId } });
      if (!acc) throw new BadRequestException('所选企业私户不存在');
      userId = acc.userId;
      name = acc.name;
    } else if (userId) {
      const person = people.find((item) => item.id === userId);
      if (!person) throw new BadRequestException('所选人员不存在或已停用');
      name = person.name;
    }
    if (!name) throw new BadRequestException('请选择或填写资金所属人员');
    if (name.length > 40) throw new BadRequestException('人员姓名过长');
    const note = String(body?.note || '').trim().slice(0, 80);

    const direction = await this.prisma.bankTxn.findUnique({ where: { id: txnId }, select: { direction: true } });
    if (!direction) throw new NotFoundException('流水不存在');
    const isOut = direction.direction === 'out';
    if (isOut) {
      // 支出：先校验私户可扣额度，避免归属创建成功、扣款失败留下空记录
      const cap = await this.privateAccounts.capacity(userId, name);
      if (cap.withdrawableCents < amountCents) {
        throw new BadRequestException(
          cap.balanceCents <= 0
            ? `「${name}」企业私户余额为 0，无法从私户扣除支出`
            : `「${name}」企业私户可扣 ¥${yuan(cap.withdrawableCents)}（余额 ¥${yuan(cap.balanceCents)}，已提取垫付 ¥${yuan(cap.advancedCents)}），不足以扣除 ¥${yuan(amountCents)}`,
        );
      }
    } else {
      const available = await this.availableBalanceCents();
      if (available != null && amountCents > available) {
        throw new BadRequestException(
          available <= 0
            ? '当前可用余额为 0（已全部在企业私户），请先划出部分后再操作'
            : `划入金额不能超过当前可用余额 ¥${yuan(available)}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const txn = await tx.bankTxn.findUnique({
        where: { id: txnId },
        include: { allocations: true },
      });
      if (!txn) throw new NotFoundException('流水不存在');
      // 只有仍锁定的归属才占用未归属余额；已解除的记录永久保留但不占额度
      const used = txn.allocations.filter((item) => item.locked).reduce((sum, item) => sum + item.amountCents, 0);
      const remain = txn.amountCents - used;
      if (amountCents > remain) {
        throw new BadRequestException(
          remain <= 0
            ? (isOut ? '这笔支出已全部从私户扣除，不能再分' : '这笔未归属余额已经全部划入企业私户，不能再分出去')
            : (isOut
              ? `本笔支出未归属还剩 ¥${yuan(remain)}，不能再扣 ¥${yuan(amountCents)}`
              : `未归属余额还剩 ¥${yuan(remain)}，不能再划入 ¥${yuan(amountCents)}`),
        );
      }
      const created = await tx.bankTxnAlloc.create({
        data: { txnId, userId, name, amountCents, note, locked: true },
      });
      await this.writeLog(tx, {
        txnId,
        allocId: created.id,
        action: 'lock',
        userId,
        name,
        amountCents,
        note,
        detail: isOut
          ? `支出从企业私户扣除 ¥${yuan(amountCents)}（${name}）`
          : `划入企业私户 ¥${yuan(amountCents)} 给 ${name}`,
        audit,
      });
      return {
        id: created.id,
        userId: created.userId,
        name: created.name,
        amount: created.amountCents / 100,
        note: created.note,
        locked: created.locked,
        remain: (remain - amountCents) / 100,
        direction: txn.direction,
      };
    }).then(async (result) => {
      try {
        if (result.direction === 'out') {
          await this.privateAccounts.debitFromOutAlloc({
            userId: result.userId,
            name: result.name,
            amountCents: Math.round(result.amount * 100),
            note: result.note,
            bankAllocId: result.id,
            bankTxnId: txnId,
          }, audit);
        } else {
          await this.privateAccounts.creditFromAlloc({
            userId: result.userId,
            name: result.name,
            amountCents: Math.round(result.amount * 100),
            note: result.note,
            bankAllocId: result.id,
            bankTxnId: txnId,
          }, audit);
        }
        return result;
      } catch (err) {
        // 私户入账/扣款失败时解除锁定，避免只挂归属、私户未变
        await this.prisma.bankTxnAlloc.update({ where: { id: result.id }, data: { locked: false } }).catch(() => null);
        throw err;
      }
    });
  }

  async setLock(allocId: number, locked: boolean, audit: BankAuditCtx = {}) {
    const alloc = await this.prisma.bankTxnAlloc.findUnique({ where: { id: allocId } });
    if (!alloc) throw new NotFoundException('归属记录不存在');
    const next = Boolean(locked);
    if (alloc.locked === next) return { id: alloc.id, locked: alloc.locked };

    const txn = await this.prisma.bankTxn.findUnique({ where: { id: alloc.txnId } });
    if (!txn) throw new NotFoundException('流水不存在');
    const isOut = txn.direction === 'out';

    if (next) {
      const siblings = await this.prisma.bankTxnAlloc.findMany({ where: { txnId: alloc.txnId } });
      const used = siblings.filter((item) => item.locked).reduce((sum, item) => sum + item.amountCents, 0);
      const remain = txn.amountCents - used;
      if (alloc.amountCents > remain) {
        throw new BadRequestException(
          isOut
            ? `本笔支出未归属还剩 ¥${yuan(remain)}，无法重新从私户扣除 ¥${yuan(alloc.amountCents)}`
            : `未归属余额还剩 ¥${yuan(remain)}，无法重新划入企业私户 ¥${yuan(alloc.amountCents)}`,
        );
      }
      if (isOut) {
        await this.privateAccounts.debitFromOutAlloc({
          userId: alloc.userId,
          name: alloc.name,
          amountCents: alloc.amountCents,
          note: alloc.note,
          bankAllocId: alloc.id,
          bankTxnId: alloc.txnId,
        }, audit);
      } else {
        const available = await this.availableBalanceCents();
        if (available != null && alloc.amountCents > available) {
          throw new BadRequestException(`当前可用余额 ¥${yuan(available)}，无法重新划入企业私户 ¥${yuan(alloc.amountCents)}`);
        }
        await this.privateAccounts.creditFromAlloc({
          userId: alloc.userId,
          name: alloc.name,
          amountCents: alloc.amountCents,
          note: alloc.note,
          bankAllocId: alloc.id,
          bankTxnId: alloc.txnId,
        }, audit);
      }
    } else if (isOut) {
      await this.privateAccounts.creditFromOutAllocUnlock({
        userId: alloc.userId,
        name: alloc.name,
        amountCents: alloc.amountCents,
        note: alloc.note,
        bankAllocId: alloc.id,
        bankTxnId: alloc.txnId,
      }, audit);
    } else {
      await this.privateAccounts.debitFromAlloc({
        userId: alloc.userId,
        name: alloc.name,
        amountCents: alloc.amountCents,
        note: alloc.note,
        bankAllocId: alloc.id,
        bankTxnId: alloc.txnId,
      }, audit);
    }

    const saved = await this.prisma.bankTxnAlloc.update({
      where: { id: allocId },
      data: { locked: next },
    });
    await this.writeLog(this.prisma, {
      txnId: alloc.txnId,
      allocId: alloc.id,
      action: next ? 'relock' : 'unlock',
      userId: alloc.userId,
      name: alloc.name,
      amountCents: alloc.amountCents,
      note: alloc.note,
      detail: isOut
        ? (next
          ? `重新从企业私户扣除支出 ¥${yuan(alloc.amountCents)}（${alloc.name}）`
          : `解除支出私户扣除 ¥${yuan(alloc.amountCents)}（${alloc.name}），金额退回该企业私户`)
        : (next
          ? `重新划入企业私户 ¥${yuan(alloc.amountCents)}（${alloc.name}）`
          : `解除企业私户归属 ¥${yuan(alloc.amountCents)}（${alloc.name}），金额释放回当前可用余额`),
      audit,
    });
    return { id: saved.id, locked: saved.locked };
  }

  async removeAlloc(_allocId: number) {
    throw new BadRequestException('归属记录禁止删除。如需调整，请解除企业私户归属后重新划入；操作会记入审计日志');
  }

  private async writeLog(
    db: { bankTxnAllocLog: { create: (args: any) => Promise<any> } },
    input: {
      txnId: number;
      allocId?: number | null;
      action: string;
      userId?: number | null;
      name: string;
      amountCents: number;
      note?: string;
      detail: string;
      audit: BankAuditCtx;
    },
  ) {
    await db.bankTxnAllocLog.create({
      data: {
        txnId: input.txnId,
        allocId: input.allocId || null,
        action: input.action,
        adminId: input.audit.adminId || null,
        adminName: String(input.audit.adminName || '').trim().slice(0, 40),
        userId: input.userId || null,
        name: input.name,
        amountCents: input.amountCents,
        note: String(input.note || '').slice(0, 80),
        ip: clientIp(input.audit.req),
        userAgent: readUserAgent(input.audit.req),
        fingerprint: readFingerprint(input.audit.req),
        detail: input.detail.slice(0, 200),
      },
    });
  }

  private actionLabel(direction: string, action: string) {
    const out = direction === 'out';
    if (action === 'lock') return out ? '从私户扣除' : '划入企业私户';
    if (action === 'unlock') return out ? '解除私户扣除' : '解除企业私户';
    if (action === 'relock') return out ? '重新从私户扣除' : '重新划入企业私户';
    return action;
  }

  private present(
    txn: {
      id: number;
      accountNo: string;
      accountName: string;
      txnDate: string;
      txnTime: string;
      direction: string;
      amountCents: number;
      balanceCents: number | null;
      counterAccount: string;
      counterName: string;
      counterBank: string;
      serialNo: string;
      slipNo: string;
      summary: string;
      remark: string;
      allocations: { id: number; userId: number | null; name: string; amountCents: number; note: string; locked: boolean; createdAt?: Date }[];
      allocLogs?: {
        id: number;
        allocId: number | null;
        action: string;
        adminId: number | null;
        adminName: string;
        name: string;
        amountCents: number;
        note: string;
        ip: string;
        userAgent: string;
        fingerprint: string;
        detail: string;
        createdAt: Date;
      }[];
    },
    people: Person[],
  ) {
    const assignedCents = txn.allocations.filter((item) => item.locked).reduce((sum, item) => sum + item.amountCents, 0);
    return {
      id: txn.id,
      accountNo: txn.accountNo,
      accountName: txn.accountName,
      txnDate: txn.txnDate,
      txnTime: txn.txnTime,
      direction: txn.direction,
      amount: txn.amountCents / 100,
      balance: txn.balanceCents == null ? null : txn.balanceCents / 100,
      counterAccount: txn.counterAccount,
      counterName: txn.counterName,
      counterBank: txn.counterBank,
      serialNo: txn.serialNo,
      slipNo: txn.slipNo,
      summary: txn.summary,
      remark: txn.remark,
      assigned: assignedCents / 100,
      remain: (txn.amountCents - assignedCents) / 100,
      suggested: this.suggest(txn.counterName, txn.counterAccount, people),
      allocations: txn.allocations.map((item) => ({
        id: item.id,
        userId: item.userId,
        name: item.name,
        amount: item.amountCents / 100,
        note: item.note,
        locked: item.locked,
        createdAt: item.createdAt || null,
      })),
      logs: (txn.allocLogs || []).map((item) => ({
        id: item.id,
        allocId: item.allocId,
        action: item.action,
        actionLabel: this.actionLabel(txn.direction, item.action),
        adminId: item.adminId,
        adminName: item.adminName,
        name: item.name,
        amount: item.amountCents / 100,
        note: item.note,
        ip: item.ip,
        userAgent: item.userAgent,
        fingerprint: item.fingerprint,
        detail: item.detail,
        createdAt: item.createdAt,
      })),
    };
  }

  private suggest(counterName: string, counterAccount: string, people: Person[]) {
    const name = counterName.trim();
    const account = counterAccount.replace(/\s/g, '');
    if (account) {
      const byAccount = people.filter((person) => person.bankAccount && person.bankAccount === account);
      if (byAccount.length === 1) return { userId: byAccount[0].id, name: byAccount[0].name, via: 'bank' as const };
    }
    if (!name || name.length > 8) return null;
    const byName = people.filter((person) => person.name === name || person.nickname === name || person.bankAccountName === name);
    if (byName.length === 1) return { userId: byName[0].id, name: byName[0].name, via: 'name' as const };
    return null;
  }

  private async people(): Promise<Person[]> {
    const users = await this.prisma.user.findMany({
      where: { status: 1 },
      select: {
        id: true,
        nickname: true,
        phone: true,
        role: true,
        teacherCert: { select: { realName: true, bankAccount: true, bankAccountName: true } },
      },
      orderBy: { id: 'desc' },
      take: 800,
    });
    return users.map((user) => {
      const certName = user.teacherCert?.realName?.trim() || '';
      const accountName = user.teacherCert?.bankAccountName?.trim() || '';
      return {
        id: user.id,
        name: certName || accountName || user.nickname?.trim() || `用户${user.id}`,
        nickname: user.nickname?.trim() || '',
        phoneTail: user.phone ? String(user.phone).slice(-4) : '',
        role: user.role,
        bankAccount: (user.teacherCert?.bankAccount || '').replace(/\s/g, ''),
        bankAccountName: user.teacherCert?.bankAccountName?.trim() || '',
      };
    });
  }
}
