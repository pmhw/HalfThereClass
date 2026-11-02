import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { clientIp } from '@/common/security';

export type ReserveAuditCtx = {
  adminId?: number | null;
  adminName?: string;
  req?: { ip?: string; headers?: Record<string, any>; socket?: { remoteAddress?: string } };
};

const KIND_LABEL: Record<string, string> = {
  tax_withhold: '代扣税费',
  invoice_tax: '开票税额',
  retention: '分成留存',
  expense_hold: '费用占用',
  expense_clear: '费用核销',
  manual_hold: '手工预留',
  manual_release: '手工释放',
};

const CATEGORY_LABEL: Record<string, string> = {
  bank_service: '网银服务费',
  card_annual: '结算卡年费',
  tax_payment: '缴纳税款',
  other: '其它费用',
};

function yuan(cents: number) {
  return (cents / 100).toFixed(2);
}

function readFingerprint(req?: ReserveAuditCtx['req']) {
  return String(req?.headers?.['x-device-fingerprint'] || req?.headers?.['x-device-fp'] || '').trim().slice(0, 120);
}

function readUserAgent(req?: ReserveAuditCtx['req']) {
  return String(req?.headers?.['user-agent'] || '').trim().slice(0, 300);
}

@Injectable()
export class ReserveService {
  constructor(private prisma: PrismaService) {}

  /** 对公预留合计（分） */
  async reserveTotalCents() {
    const entries = await this.prisma.financeReserveEntry.findMany({
      select: { direction: true, amountCents: true },
    });
    return entries.reduce((sum, row) => sum + (row.direction === 'in' ? row.amountCents : -row.amountCents), 0);
  }

  /** 补记已确认但尚未写入预留的开票税额（幂等） */
  async ensureConfirmedInvoices(audit: ReserveAuditCtx = {}) {
    const rows = await this.prisma.financeInvoice.findMany({
      where: { status: 'confirmed', taxCents: { gt: 0 } },
      select: { id: true, month: true, taxCents: true, status: true, title: true, invoiceNo: true },
    });
    for (const row of rows) {
      const net = await this.netCents('invoice', `invoice:${row.id}`);
      if (net !== row.taxCents) {
        await this.syncInvoiceReserve(row, audit.adminName ? audit : { adminName: 'system' });
      }
    }
  }

  async list() {
    await this.ensureConfirmedInvoices();
    const [entries, expenses, allForTotal] = await Promise.all([
      this.prisma.financeReserveEntry.findMany({ orderBy: { id: 'desc' }, take: 120 }),
      this.prisma.financeExpense.findMany({ orderBy: { id: 'desc' }, take: 80 }),
      this.prisma.financeReserveEntry.findMany({ select: { kind: true, direction: true, amountCents: true } }),
    ]);
    const byKind: Record<string, number> = {};
    let totalCents = 0;
    for (const row of allForTotal) {
      const delta = row.direction === 'in' ? row.amountCents : -row.amountCents;
      totalCents += delta;
      byKind[row.kind] = (byKind[row.kind] || 0) + delta;
    }
    const buckets = [
      { kind: 'tax_withhold', label: KIND_LABEL.tax_withhold, amount: (byKind.tax_withhold || 0) / 100 },
      { kind: 'invoice_tax', label: KIND_LABEL.invoice_tax, amount: (byKind.invoice_tax || 0) / 100 },
      { kind: 'retention', label: KIND_LABEL.retention, amount: (byKind.retention || 0) / 100 },
      {
        kind: 'expense',
        label: '费用占用',
        amount: ((byKind.expense_hold || 0) - (byKind.expense_clear || 0)) / 100,
      },
      {
        kind: 'manual',
        label: '手工预留',
        amount: ((byKind.manual_hold || 0) - (byKind.manual_release || 0)) / 100,
      },
    ].filter((b) => Math.abs(b.amount) > 0.0001 || ['tax_withhold', 'invoice_tax', 'expense'].includes(b.kind));

    return {
      total: totalCents / 100,
      buckets,
      entries: entries.map((row) => this.presentEntry(row)),
      expenses: expenses.map((row) => this.presentExpense(row)),
    };
  }

  /**
   * 同步某月「代扣税费 / 分成留存」目标额（开票税额按发票单独挂）。
   * targets 单位为分；传 0 表示释放该桶。
   */
  async syncMonthCorporate(
    month: string,
    targets: { taxCents?: number; retentionCents?: number },
    audit: ReserveAuditCtx = {},
  ) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('月份格式应为 YYYY-MM');
    const tax = Math.max(0, Math.round(Number(targets.taxCents) || 0));
    const retention = Math.max(0, Math.round(Number(targets.retentionCents) || 0));
    await this.setBucket('tax_withhold', 'month', `m:${month}:tax`, month, tax, `${month} 代扣税费`, audit);
    await this.setBucket('retention', 'month', `m:${month}:retention`, month, retention, `${month} 分成留存`, audit);
    return { month, taxCents: tax, retentionCents: retention };
  }

  /** 已确认开票税额写入预留；draft / 删除时释放 */
  async syncInvoiceReserve(
    invoice: { id: number; month: string; taxCents: number; status: string; title?: string; invoiceNo?: string },
    audit: ReserveAuditCtx = {},
  ) {
    const refKey = `invoice:${invoice.id}`;
    const want = invoice.status === 'confirmed' && Number(invoice.taxCents) > 0
      ? Math.round(Number(invoice.taxCents))
      : 0;
    const label = invoice.title || invoice.invoiceNo || `发票#${invoice.id}`;
    await this.setBucket(
      'invoice_tax',
      'invoice',
      refKey,
      invoice.month || '',
      want,
      `开票税额 · ${label}`,
      audit,
    );
    return { invoiceId: invoice.id, amountCents: want };
  }

  async releaseInvoiceReserve(invoiceId: number, month: string, audit: ReserveAuditCtx = {}) {
    await this.setBucket('invoice_tax', 'invoice', `invoice:${invoiceId}`, month || '', 0, `释放开票税额 #${invoiceId}`, audit);
  }

  /**
   * 登记对公费用：先从可用划入预留（expense_hold）。
   * afterImport=true 表示银行流水已扣款，登记同时 hold+clear（预留净变动为 0，仅记账说明）。
   */
  async createExpense(body: any, availableCents: number | null, audit: ReserveAuditCtx = {}) {
    const category = this.normalizeCategory(body?.category);
    const amountCents = this.parseAmountCents(body?.amount);
    const title = String(body?.title || CATEGORY_LABEL[category] || '费用').trim().slice(0, 80);
    const note = String(body?.note || '').trim().slice(0, 200);
    const month = /^\d{4}-\d{2}$/.test(String(body?.month || '')) ? String(body.month) : '';
    const afterImport = body?.afterImport === true;
    const bankTxnId = body?.bankTxnId != null && body.bankTxnId !== '' ? Number(body.bankTxnId) : null;

    if (!afterImport) {
      if (availableCents == null) throw new BadRequestException('还没有导入账户余额，无法登记费用');
      if (amountCents > availableCents) {
        throw new BadRequestException(`当前可用余额不足（可用 ¥${yuan(availableCents)}，费用 ¥${yuan(amountCents)}）`);
      }
    }

    if (afterImport && bankTxnId) {
      await this.assertOutTxn(bankTxnId, amountCents);
    }

    const hold = await this.writeEntry({
      kind: 'expense_hold',
      direction: 'in',
      amountCents,
      month,
      refType: 'expense',
      refKey: '',
      note: note || title,
      detail: JSON.stringify({ category, title, afterImport: !!afterImport }),
      audit,
    });

    let clearId: number | null = null;
    let status = 'pending';
    if (afterImport) {
      const clear = await this.writeEntry({
        kind: 'expense_clear',
        direction: 'out',
        amountCents,
        month,
        refType: 'expense',
        refKey: `expense-hold:${hold.id}`,
        note: `补登记核销 · ${title}`,
        detail: JSON.stringify({ category, bankTxnId }),
        audit,
      });
      clearId = clear.id;
      status = 'matched';
    }

    const row = await this.prisma.financeExpense.create({
      data: {
        category,
        title,
        amountCents,
        status,
        month,
        bankTxnId: afterImport ? bankTxnId : null,
        reserveHoldId: hold.id,
        reserveClearId: clearId,
        note,
        adminId: audit.adminId || null,
        adminName: audit.adminName || '',
      },
    });
    await this.prisma.financeReserveEntry.update({
      where: { id: hold.id },
      data: { refKey: `expense:${row.id}` },
    });
    if (clearId) {
      await this.prisma.financeReserveEntry.update({
        where: { id: clearId },
        data: { refKey: `expense:${row.id}` },
      });
    }
    return this.presentExpense(row);
  }

  /** 匹配银行支出流水：释放预留（账户余额已因导入下降，可用回到登记前） */
  async matchExpense(id: number, body: any, audit: ReserveAuditCtx = {}) {
    const row = await this.prisma.financeExpense.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('费用记录不存在');
    if (row.status !== 'pending') throw new BadRequestException('只能核销待匹配的费用');
    const bankTxnId = Number(body?.bankTxnId);
    if (!Number.isFinite(bankTxnId) || bankTxnId <= 0) throw new BadRequestException('请选择银行支出流水');
    await this.assertOutTxn(bankTxnId, row.amountCents);

    const clear = await this.writeEntry({
      kind: 'expense_clear',
      direction: 'out',
      amountCents: row.amountCents,
      month: row.month,
      refType: 'expense',
      refKey: `expense:${row.id}`,
      note: `核销 · ${row.title || CATEGORY_LABEL[row.category] || '费用'}`,
      detail: JSON.stringify({ bankTxnId }),
      audit,
    });
    const saved = await this.prisma.financeExpense.update({
      where: { id },
      data: {
        status: 'matched',
        bankTxnId,
        reserveClearId: clear.id,
        note: body?.note != null ? String(body.note).trim().slice(0, 200) : row.note,
      },
    });
    return this.presentExpense(saved);
  }

  async voidExpense(id: number, audit: ReserveAuditCtx = {}) {
    const row = await this.prisma.financeExpense.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('费用记录不存在');
    if (row.status === 'void') return this.presentExpense(row);
    if (row.status === 'matched') {
      throw new BadRequestException('已核销费用不能作废；如需调整请另记冲正');
    }
    const clear = await this.writeEntry({
      kind: 'expense_clear',
      direction: 'out',
      amountCents: row.amountCents,
      month: row.month,
      refType: 'expense',
      refKey: `expense:${row.id}`,
      note: `作废费用 · ${row.title || CATEGORY_LABEL[row.category] || '费用'}`,
      detail: JSON.stringify({ void: true }),
      audit,
    });
    const saved = await this.prisma.financeExpense.update({
      where: { id },
      data: { status: 'void', reserveClearId: clear.id },
    });
    return this.presentExpense(saved);
  }

  /** 手工预留 / 释放（备注必填） */
  async manualAdjust(body: any, availableCents: number | null, audit: ReserveAuditCtx = {}) {
    const direction = body?.direction === 'release' ? 'release' : 'hold';
    const amountCents = this.parseAmountCents(body?.amount);
    const note = String(body?.note || '').trim().slice(0, 200);
    if (!note) throw new BadRequestException('请填写备注');
    const month = /^\d{4}-\d{2}$/.test(String(body?.month || '')) ? String(body.month) : '';

    if (direction === 'hold') {
      if (availableCents == null) throw new BadRequestException('还没有导入账户余额');
      if (amountCents > availableCents) {
        throw new BadRequestException(`当前可用余额不足（可用 ¥${yuan(availableCents)}）`);
      }
      await this.writeEntry({
        kind: 'manual_hold',
        direction: 'in',
        amountCents,
        month,
        refType: 'manual',
        refKey: `manual:${Date.now()}`,
        note,
        detail: '',
        audit,
      });
    } else {
      const total = await this.reserveTotalCents();
      if (amountCents > total) {
        throw new BadRequestException(`对公预留不足（预留 ¥${yuan(total)}）`);
      }
      await this.writeEntry({
        kind: 'manual_release',
        direction: 'out',
        amountCents,
        month,
        refType: 'manual',
        refKey: `manual:${Date.now()}`,
        note,
        detail: '',
        audit,
      });
    }
    return this.list();
  }

  private async setBucket(
    kind: string,
    refType: string,
    refKey: string,
    month: string,
    targetCents: number,
    note: string,
    audit: ReserveAuditCtx,
  ) {
    const current = await this.netCents(refType, refKey);
    const delta = Math.round(targetCents) - current;
    if (delta === 0) return;
    if (delta > 0) {
      await this.writeEntry({
        kind,
        direction: 'in',
        amountCents: delta,
        month,
        refType,
        refKey,
        note,
        detail: JSON.stringify({ targetCents, previous: current }),
        audit,
      });
    } else {
      await this.writeEntry({
        kind: kind === 'manual_hold' ? 'manual_release' : kind,
        direction: 'out',
        amountCents: -delta,
        month,
        refType,
        refKey,
        note: `释放 · ${note}`,
        detail: JSON.stringify({ targetCents, previous: current }),
        audit,
      });
    }
  }

  private async netCents(refType: string, refKey: string) {
    const rows = await this.prisma.financeReserveEntry.findMany({
      where: { refType, refKey },
      select: { direction: true, amountCents: true },
    });
    return rows.reduce((sum, row) => sum + (row.direction === 'in' ? row.amountCents : -row.amountCents), 0);
  }

  private async writeEntry(input: {
    kind: string;
    direction: 'in' | 'out';
    amountCents: number;
    month: string;
    refType: string;
    refKey: string;
    note: string;
    detail: string;
    audit: ReserveAuditCtx;
  }) {
    if (!(input.amountCents > 0)) throw new BadRequestException('金额必须大于 0');
    return this.prisma.financeReserveEntry.create({
      data: {
        kind: input.kind,
        direction: input.direction,
        amountCents: input.amountCents,
        month: input.month || '',
        refType: input.refType || '',
        refKey: input.refKey || '',
        note: input.note || '',
        adminId: input.audit.adminId || null,
        adminName: input.audit.adminName || '',
        ip: clientIp(input.audit.req) || '',
        userAgent: readUserAgent(input.audit.req),
        fingerprint: readFingerprint(input.audit.req),
        detail: input.detail || '',
      },
    });
  }

  private async assertOutTxn(bankTxnId: number, amountCents: number) {
    const txn = await this.prisma.bankTxn.findUnique({ where: { id: bankTxnId } });
    if (!txn) throw new NotFoundException('银行流水不存在');
    if (txn.direction !== 'out') throw new BadRequestException('请选择支出流水');
    const txnCents = Math.abs(Number(txn.amountCents) || 0);
    if (Math.abs(txnCents - amountCents) > 1) {
      throw new BadRequestException(
        `流水金额 ¥${yuan(txnCents)} 与费用 ¥${yuan(amountCents)} 不一致，请核对后再核销`,
      );
    }
  }

  private parseAmountCents(raw: any) {
    const yuanVal = Number(raw);
    if (!Number.isFinite(yuanVal) || yuanVal <= 0) throw new BadRequestException('请填写有效金额');
    return Math.round(yuanVal * 100);
  }

  private normalizeCategory(raw: any) {
    const key = String(raw || 'other').trim();
    if (CATEGORY_LABEL[key]) return key;
    return 'other';
  }

  private presentEntry(row: {
    id: number;
    kind: string;
    direction: string;
    amountCents: number;
    month: string;
    refType: string;
    refKey: string;
    note: string;
    adminName: string;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      kind: row.kind,
      kindLabel: KIND_LABEL[row.kind] || row.kind,
      direction: row.direction,
      amount: row.amountCents / 100,
      month: row.month,
      refType: row.refType,
      refKey: row.refKey,
      note: row.note,
      adminName: row.adminName,
      createdAt: row.createdAt,
    };
  }

  private presentExpense(row: {
    id: number;
    category: string;
    title: string;
    amountCents: number;
    status: string;
    month: string;
    bankTxnId: number | null;
    note: string;
    adminName: string;
    createdAt: Date;
    updatedAt?: Date;
  }) {
    return {
      id: row.id,
      category: row.category,
      categoryLabel: CATEGORY_LABEL[row.category] || row.category,
      title: row.title,
      amount: row.amountCents / 100,
      status: row.status,
      statusLabel: row.status === 'pending' ? '待核销' : row.status === 'matched' ? '已核销' : '已作废',
      month: row.month,
      bankTxnId: row.bankTxnId,
      note: row.note,
      adminName: row.adminName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
