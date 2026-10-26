import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { parseSpdWorkbook } from './bank-import';

type Person = {
  id: number;
  name: string;
  nickname: string;
  phoneTail: string;
  role: string;
  bankAccount: string;
  bankAccountName: string;
};

function yuan(cents: number) {
  return (cents / 100).toFixed(2);
}

@Injectable()
export class BankTxnService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const [txns, people] = await Promise.all([
      this.prisma.bankTxn.findMany({
        orderBy: [{ txnDate: 'desc' }, { txnTime: 'desc' }, { id: 'desc' }],
        include: { allocations: { orderBy: { id: 'asc' } } },
      }),
      this.people(),
    ]);
    return {
      txns: txns.map((txn) => this.present(txn, people)),
      people: people.map(({ bankAccount, bankAccountName, ...person }) => person),
    };
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
        await tx.bankTxn.create({ data: row });
        inserted += 1;
      }
    });
    return {
      inserted,
      skipped,
      total: parsed.rows.length,
      accountNo: parsed.accountNo,
      accountName: parsed.accountName,
    };
  }

  async allocate(txnId: number, body: { userId?: number | null; name?: string; amount?: number; note?: string }) {
    const amountCents = Math.round(Number(body?.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) throw new BadRequestException('请填写大于 0 的归属金额');
    const people = await this.people();
    const userId = Number(body?.userId) || null;
    let name = String(body?.name || '').trim();
    if (userId) {
      const person = people.find((item) => item.id === userId);
      if (!person) throw new BadRequestException('所选人员不存在或已停用');
      name = person.name;
    }
    if (!name) throw new BadRequestException('请选择或填写资金所属人员');
    if (name.length > 40) throw new BadRequestException('人员姓名过长');
    const note = String(body?.note || '').trim().slice(0, 80);

    return this.prisma.$transaction(async (tx) => {
      const txn = await tx.bankTxn.findUnique({
        where: { id: txnId },
        include: { allocations: true },
      });
      if (!txn) throw new NotFoundException('流水不存在');
      const used = txn.allocations.reduce((sum, item) => sum + item.amountCents, 0);
      const remain = txn.amountCents - used;
      if (amountCents > remain) {
        throw new BadRequestException(
          remain <= 0
            ? '这笔未归属余额已经全部锁定，不能再分出去'
            : `未归属余额还剩 ¥${yuan(remain)}，不能再锁定 ¥${yuan(amountCents)}`,
        );
      }
      const created = await tx.bankTxnAlloc.create({
        data: { txnId, userId, name, amountCents, note, locked: true },
      });
      return {
        id: created.id,
        userId: created.userId,
        name: created.name,
        amount: created.amountCents / 100,
        note: created.note,
        locked: created.locked,
        remain: (remain - amountCents) / 100,
      };
    });
  }

  async setLock(allocId: number, locked: boolean) {
    const alloc = await this.prisma.bankTxnAlloc.findUnique({ where: { id: allocId } });
    if (!alloc) throw new NotFoundException('归属记录不存在');
    const saved = await this.prisma.bankTxnAlloc.update({
      where: { id: allocId },
      data: { locked: Boolean(locked) },
    });
    return { id: saved.id, locked: saved.locked };
  }

  async removeAlloc(allocId: number) {
    const alloc = await this.prisma.bankTxnAlloc.findUnique({ where: { id: allocId } });
    if (!alloc) throw new NotFoundException('归属记录不存在');
    if (alloc.locked) throw new BadRequestException('这笔归属已锁定，解除锁定后才能删除，避免已归属的金额被挪走');
    await this.prisma.bankTxnAlloc.delete({ where: { id: allocId } });
    return { id: allocId };
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
      allocations: { id: number; userId: number | null; name: string; amountCents: number; note: string; locked: boolean }[];
    },
    people: Person[],
  ) {
    const assignedCents = txn.allocations.reduce((sum, item) => sum + item.amountCents, 0);
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
