import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PrivateAccountService } from './private-account.service';

function yuan(cents: number) {
  return (cents / 100).toFixed(2);
}

@Injectable()
export class AdvanceService {
  constructor(
    private prisma: PrismaService,
    private privateAccounts: PrivateAccountService,
  ) {}

  async list() {
    const rows = await this.prisma.financeAdvance.findMany({
      orderBy: [{ status: 'asc' }, { id: 'desc' }],
      include: {
        uses: { orderBy: { id: 'desc' } },
        repays: { orderBy: { id: 'desc' }, include: { bankTxn: { select: { id: true, txnDate: true, txnTime: true, amountCents: true, counterName: true, summary: true } } } },
      },
    });
    const list = rows.map((row) => this.present(row));
    const open = list.filter((item) => item.status === 'open');
    return {
      list,
      totals: {
        pool: open.reduce((sum, item) => sum + item.available, 0),
        owed: open.reduce((sum, item) => sum + item.owed, 0),
        pendingRepay: list.reduce(
          (sum, item) => sum + item.repays.filter((r) => r.status === 'pending').reduce((a, r) => a + r.amount, 0),
          0,
        ),
      },
    };
  }

  async create(body: { userId?: number | null; name?: string; amount?: number; note?: string }, adminId?: number) {
    const amountCents = Math.round(Number(body?.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) throw new BadRequestException('请填写大于 0 的垫付金额');
    const userId = Number(body?.userId) || null;
    let name = String(body?.name || '').trim();
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, nickname: true, teacherCert: { select: { realName: true } } },
      });
      if (!user) throw new BadRequestException('所选垫付人不存在');
      name = user.teacherCert?.realName || user.nickname || `用户${user.id}`;
    }
    if (!name) throw new BadRequestException('请选择或填写垫付人');
    if (name.length > 40) throw new BadRequestException('垫付人姓名过长');

    // 垫付必须从该人企业私户余额中提取
    const cap = await this.lockCapacity(userId, name);
    if (amountCents > cap.advanceableCents) {
      throw new BadRequestException(
        cap.lockedCents <= 0
          ? `「${name}」还没有企业私户余额，请先在「浦发银行」划入企业私户，再提取垫付`
          : `「${name}」可提取垫付还剩 ¥${yuan(cap.advanceableCents)}（企业私户 ¥${yuan(cap.lockedCents)}，已提取垫付 ¥${yuan(cap.advancedCents)}）`,
      );
    }

    const created = await this.prisma.financeAdvance.create({
      data: {
        userId,
        name,
        amountCents,
        note: String(body?.note || '').trim().slice(0, 120),
        status: 'open',
        createdBy: adminId || null,
      },
      include: { uses: true, repays: true },
    });
    return this.present(created);
  }

  /**
   * 某人企业私户 / 已提取垫付 / 还可垫付的额度。
   * 垫付从企业私户提取：可垫付 = 私户余额 − 进行中垫付单金额。
   */
  async lockCapacity(userId?: number | null, name?: string) {
    const cap = await this.privateAccounts.capacity(userId, name);
    return {
      userId: cap.userId,
      name: cap.name,
      lockedCents: cap.balanceCents,
      advancedCents: cap.advancedCents,
      advanceableCents: cap.advanceableCents,
    };
  }

  /** 各企业私户可垫付汇总（浦发银行页展示） */
  async lockOwnerCaps() {
    return this.privateAccounts.ownerCaps();
  }

  async close(id: number) {
    const row = await this.load(id);
    const available = this.availableCents(row);
    const owed = this.owedCents(row);
    if (available > 0) {
      throw new BadRequestException(`还有 ¥${yuan(available)} 未用于打款，请先用完后再关闭`);
    }
    if (owed > 0) {
      throw new BadRequestException(`还有 ¥${yuan(owed)} 待补还，补还完成后再关闭`);
    }
    const saved = await this.prisma.financeAdvance.update({ where: { id }, data: { status: 'closed' } });
    return { id: saved.id, status: saved.status };
  }

  /**
   * 标记已打款时从垫付池按 FIFO 消耗；返回实际消耗明细。
   * needCents 为本次实发合计（分）。
   */
  async consumeForPayout(month: string, needCents: number, payeeKeys: string[], adminId?: number) {
    if (needCents <= 0) return { used: 0, uses: [] as any[] };
    const opens = await this.prisma.financeAdvance.findMany({
      where: { status: 'open' },
      orderBy: { id: 'asc' },
      include: { uses: true, repays: { where: { status: 'confirmed' } } },
    });
    let left = needCents;
    const created: any[] = [];
    for (const row of opens) {
      if (left <= 0) break;
      const available = this.availableCents(row);
      if (available <= 0) continue;
      const take = Math.min(available, left);
      const use = await this.prisma.financeAdvanceUse.create({
        data: {
          advanceId: row.id,
          month,
          amountCents: take,
          payeeKeys: JSON.stringify(payeeKeys),
          createdBy: adminId || null,
        },
      });
      created.push({
        id: use.id,
        advanceId: row.id,
        name: row.name,
        amount: take / 100,
        month,
      });
      left -= take;
    }
    if (left > 0) {
      // 回滚本次创建的消耗
      if (created.length) {
        await this.prisma.financeAdvanceUse.deleteMany({ where: { id: { in: created.map((u) => u.id) } } });
      }
      throw new BadRequestException(
        `垫付可用资金不足，还差 ¥${yuan(left)}。请先在「浦发银行」从企业私户提取垫付，再标记已打款。`,
      );
    }
    return { used: needCents / 100, uses: created };
  }

  /** 撤销打款：按月 + 收款人键尽量退回最近一次消耗（同批 payeeKeys 完全匹配优先） */
  async refundPayoutUses(month: string, payeeKeys: string[]) {
    const keySet = new Set(payeeKeys);
    const uses = await this.prisma.financeAdvanceUse.findMany({
      where: { month },
      orderBy: { id: 'desc' },
    });
    const removeIds: number[] = [];
    for (const use of uses) {
      let keys: string[] = [];
      try {
        keys = JSON.parse(use.payeeKeys || '[]');
      } catch {
        keys = [];
      }
      if (!Array.isArray(keys) || !keys.length) continue;
      if (keys.every((k) => keySet.has(String(k))) && keys.length === keySet.size) {
        removeIds.push(use.id);
      }
    }
    if (removeIds.length) {
      await this.prisma.financeAdvanceUse.deleteMany({ where: { id: { in: removeIds } } });
    }
    return { removed: removeIds.length };
  }

  /** 导入进账后：按欠款 FIFO 自动生成待确认补还；金额恰好等于某一笔欠款则直接确认 */
  async matchInboundTxn(txn: { id: number; direction: string; amountCents: number; counterName?: string }) {
    if (txn.direction !== 'in' || txn.amountCents <= 0) return { matched: 0, confirmed: 0, pending: 0 };
    const existing = await this.prisma.financeAdvanceRepay.findFirst({
      where: { bankTxnId: txn.id },
      select: { id: true },
    });
    if (existing) return { matched: 0, confirmed: 0, pending: 0 };

    const opens = await this.prisma.financeAdvance.findMany({
      where: { status: 'open' },
      orderBy: { id: 'asc' },
      include: { uses: true, repays: true },
    });
    const debts = opens
      .map((row) => ({ row, owed: this.owedCents(row) }))
      .filter((item) => item.owed > 0);
    if (!debts.length) return { matched: 0, confirmed: 0, pending: 0 };

    // 对方户名命中垫付人时优先
    const counter = String(txn.counterName || '').trim();
    const ordered = [...debts].sort((a, b) => {
      const aHit = counter && (a.row.name === counter || (a.row.userId && counter.includes(a.row.name))) ? 0 : 1;
      const bHit = counter && (b.row.name === counter || (b.row.userId && counter.includes(b.row.name))) ? 0 : 1;
      return aHit - bHit || a.row.id - b.row.id;
    });

    const exact = ordered.find((item) => item.owed === txn.amountCents);
    if (exact) {
      await this.prisma.financeAdvanceRepay.create({
        data: {
          advanceId: exact.row.id,
          bankTxnId: txn.id,
          amountCents: txn.amountCents,
          status: 'confirmed',
          note: '进账金额与欠款一致，自动确认补还',
          confirmedAt: new Date(),
        },
      });
      await this.maybeClose(exact.row.id);
      return { matched: 1, confirmed: 1, pending: 0 };
    }

    // 否则挂到第一笔欠款上，待人工确认（可拆或改）
    const first = ordered[0];
    const amount = Math.min(first.owed, txn.amountCents);
    await this.prisma.financeAdvanceRepay.create({
      data: {
        advanceId: first.row.id,
        bankTxnId: txn.id,
        amountCents: amount,
        status: 'pending',
        note: amount < txn.amountCents
          ? `进账 ¥${yuan(txn.amountCents)}，建议先补还 ¥${yuan(amount)}，请确认`
          : '进账自动匹配，请确认补还',
      },
    });
    return { matched: 1, confirmed: 0, pending: 1 };
  }

  async confirmRepay(id: number, adminId?: number) {
    const repay = await this.prisma.financeAdvanceRepay.findUnique({ where: { id } });
    if (!repay) throw new NotFoundException('补还记录不存在');
    if (repay.status === 'confirmed') return { id: repay.id, status: repay.status };
    const advance = await this.load(repay.advanceId);
    const owed = this.owedCents(advance);
    if (repay.amountCents > owed) {
      throw new BadRequestException(`待补还只剩 ¥${yuan(owed)}，请先调整金额`);
    }
    const saved = await this.prisma.financeAdvanceRepay.update({
      where: { id },
      data: { status: 'confirmed', confirmedAt: new Date(), createdBy: adminId || repay.createdBy },
    });
    await this.maybeClose(repay.advanceId);
    return { id: saved.id, status: saved.status };
  }

  async rejectRepay(id: number) {
    const repay = await this.prisma.financeAdvanceRepay.findUnique({ where: { id } });
    if (!repay) throw new NotFoundException('补还记录不存在');
    if (repay.status === 'confirmed') throw new BadRequestException('已确认的补还不能删除，避免账目错乱');
    await this.prisma.financeAdvanceRepay.delete({ where: { id } });
    return { id };
  }

  /** 手动把某笔进账流水确认补还给指定垫付单 */
  async repayFromTxn(advanceId: number, body: { bankTxnId: number; amount?: number; note?: string }, adminId?: number) {
    const advance = await this.load(advanceId);
    if (advance.status !== 'open') throw new BadRequestException('该垫付单已关闭');
    const owed = this.owedCents(advance);
    if (owed <= 0) throw new BadRequestException('该垫付单已无需补还');

    const txnId = Number(body?.bankTxnId);
    const txn = await this.prisma.bankTxn.findUnique({ where: { id: txnId } });
    if (!txn) throw new NotFoundException('流水不存在');
    if (txn.direction !== 'in') throw new BadRequestException('只能用收入流水补还垫付');

    const taken = await this.prisma.financeAdvanceRepay.aggregate({
      where: { bankTxnId: txnId, status: { in: ['pending', 'confirmed'] } },
      _sum: { amountCents: true },
    });
    const remain = txn.amountCents - Number(taken._sum.amountCents || 0);
    if (remain <= 0) throw new BadRequestException('该流水已全部用于补还或归属');

    let amountCents = body?.amount == null || body?.amount === undefined || String(body.amount) === ''
      ? Math.min(owed, remain)
      : Math.round(Number(body.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) throw new BadRequestException('补还金额不正确');
    if (amountCents > owed) throw new BadRequestException(`待补还只剩 ¥${yuan(owed)}`);
    if (amountCents > remain) throw new BadRequestException(`该流水还可用于补还 ¥${yuan(remain)}`);

    const created = await this.prisma.financeAdvanceRepay.create({
      data: {
        advanceId,
        bankTxnId: txnId,
        amountCents,
        status: 'confirmed',
        note: String(body?.note || '').trim().slice(0, 120) || '手动确认补还',
        confirmedAt: new Date(),
        createdBy: adminId || null,
      },
    });
    await this.maybeClose(advanceId);
    return {
      id: created.id,
      advanceId,
      amount: amountCents / 100,
      status: created.status,
    };
  }

  private async maybeClose(advanceId: number) {
    const row = await this.load(advanceId);
    if (this.availableCents(row) <= 0 && this.owedCents(row) <= 0) {
      await this.prisma.financeAdvance.update({ where: { id: advanceId }, data: { status: 'closed' } });
    }
  }

  private async load(id: number) {
    const row = await this.prisma.financeAdvance.findUnique({
      where: { id },
      include: { uses: true, repays: true },
    });
    if (!row) throw new NotFoundException('垫付单不存在');
    return row;
  }

  private usedCents(row: { uses: { amountCents: number }[] }) {
    return row.uses.reduce((sum, item) => sum + item.amountCents, 0);
  }

  private repaidCents(row: { repays: { amountCents: number; status: string }[] }) {
    return row.repays.filter((item) => item.status === 'confirmed').reduce((sum, item) => sum + item.amountCents, 0);
  }

  private availableCents(row: { amountCents: number; uses: { amountCents: number }[] }) {
    return Math.max(0, row.amountCents - this.usedCents(row));
  }

  private owedCents(row: { amountCents: number; repays: { amountCents: number; status: string }[] }) {
    return Math.max(0, row.amountCents - this.repaidCents(row));
  }

  private present(row: {
    id: number;
    userId: number | null;
    name: string;
    amountCents: number;
    note: string;
    status: string;
    createdAt: Date;
    uses: { id: number; month: string; amountCents: number; payeeKeys: string; createdAt: Date }[];
    repays: {
      id: number;
      bankTxnId: number | null;
      amountCents: number;
      status: string;
      note: string;
      confirmedAt: Date | null;
      createdAt: Date;
      bankTxn?: { id: number; txnDate: string; txnTime: string; amountCents: number; counterName: string; summary: string } | null;
    }[];
  }) {
    const used = this.usedCents(row);
    const repaid = this.repaidCents(row);
    const available = Math.max(0, row.amountCents - used);
    const owed = Math.max(0, row.amountCents - repaid);
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      amount: row.amountCents / 100,
      used: used / 100,
      available: available / 100,
      repaid: repaid / 100,
      owed: owed / 100,
      note: row.note,
      status: row.status,
      createdAt: row.createdAt,
      uses: row.uses.map((item) => ({
        id: item.id,
        month: item.month,
        amount: item.amountCents / 100,
        payeeKeys: (() => {
          try {
            return JSON.parse(item.payeeKeys || '[]');
          } catch {
            return [];
          }
        })(),
        createdAt: item.createdAt,
      })),
      repays: row.repays.map((item) => ({
        id: item.id,
        bankTxnId: item.bankTxnId,
        amount: item.amountCents / 100,
        status: item.status,
        note: item.note,
        confirmedAt: item.confirmedAt,
        createdAt: item.createdAt,
        bankTxn: item.bankTxn
          ? {
              id: item.bankTxn.id,
              txnDate: item.bankTxn.txnDate,
              txnTime: item.bankTxn.txnTime,
              amount: item.bankTxn.amountCents / 100,
              counterName: item.bankTxn.counterName,
              summary: item.bankTxn.summary,
            }
          : null,
      })),
    };
  }
}
