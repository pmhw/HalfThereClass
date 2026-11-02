import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '@/common/prisma/prisma.service';
import { parseInvoiceText } from './invoice-parse';
import { ReserveService, ReserveAuditCtx } from './reserve.service';

@Injectable()
export class InvoiceService {
  constructor(
    private prisma: PrismaService,
    private reserves: ReserveService,
  ) {}

  async list(month?: string) {
    const where = month && /^\d{4}-\d{2}$/.test(month) ? { month } : {};
    const rows = await this.prisma.financeInvoice.findMany({
      where,
      orderBy: [{ month: 'desc' }, { id: 'desc' }],
    });
    const collections = await this.prisma.splitCollection.findMany({
      select: { id: true, name: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return {
      list: rows.map((row) => this.present(row)),
      collections,
      totals: {
        amount: rows.reduce((sum, row) => sum + row.amountCents, 0) / 100,
        tax: rows.filter((row) => row.status === 'confirmed').reduce((sum, row) => sum + row.taxCents, 0) / 100,
      },
    };
  }

  /**
   * 分成扣除：已确认且关联合集的税额。
   * 关联了个人 → 从该人分成中扣；未关联个人 → 从合集分成池扣。
   */
  async deductions(month: string) {
    const rows = await this.prisma.financeInvoice.findMany({
      where: { month, status: 'confirmed', collectionId: { not: null }, taxCents: { gt: 0 } },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      collectionId: row.collectionId as number,
      amount: row.taxCents / 100,
      title: row.title || row.invoiceNo || `发票#${row.id}`,
      kind: 'invoice' as const,
      status: row.status,
      invoiceNo: row.invoiceNo,
      sellerName: row.sellerName,
      userId: row.userId,
      userName: row.userName || '',
    }));
  }

  async create(body: any, adminId?: number, audit: ReserveAuditCtx = {}) {
    const data = await this.normalize(body);
    const created = await this.prisma.financeInvoice.create({
      data: { ...data, createdBy: adminId || null },
    });
    await this.reserves.syncInvoiceReserve(created, { ...audit, adminId: adminId || audit.adminId });
    return this.present(created);
  }

  async update(id: number, body: any, audit: ReserveAuditCtx = {}) {
    const existing = await this.prisma.financeInvoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('开票记录不存在');
    const data = await this.normalize({ ...this.present(existing), ...body, month: body?.month || existing.month });
    const saved = await this.prisma.financeInvoice.update({ where: { id }, data });
    await this.reserves.syncInvoiceReserve(saved, audit);
    return this.present(saved);
  }

  async remove(id: number, audit: ReserveAuditCtx = {}) {
    const existing = await this.prisma.financeInvoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('开票记录不存在');
    await this.reserves.releaseInvoiceReserve(existing.id, existing.month, audit);
    await this.prisma.financeInvoice.delete({ where: { id } });
    return { id };
  }

  async importPdf(file: { buffer?: Buffer; originalname?: string; mimetype?: string }, body: any, adminId?: number) {
    if (!file?.buffer?.length) throw new BadRequestException('请上传发票 PDF');
    const name = String(file.originalname || '');
    const mime = String(file.mimetype || '');
    if (!/\.pdf$/i.test(name) && !/pdf/i.test(mime)) {
      throw new BadRequestException('请上传 PDF 格式的电子发票');
    }

    let rawText = '';
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse');
      const parsed = await pdfParse(file.buffer);
      rawText = String(parsed?.text || '');
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? `无法识别 PDF：${err.message}` : '无法识别 PDF');
    }
    if (!rawText.trim()) throw new BadRequestException('PDF 里没有可识别的文字，请改用手动录入');

    const parsed = parseInvoiceText(rawText);
    const dir = join(process.cwd(), 'uploads', 'invoices');
    mkdirSync(dir, { recursive: true });
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
    writeFileSync(join(dir, fileName), file.buffer);
    const pdfPath = `/uploads/invoices/${fileName}`;

    const month = String(body?.month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('请选择归属月份');

    const tax = body?.tax != null && body.tax !== '' ? Number(body.tax) : parsed.tax;
    const amount = body?.amount != null && body.amount !== '' ? Number(body.amount) : parsed.amount;
    if (tax == null || !Number.isFinite(Number(tax)) || Number(tax) < 0) {
      throw new BadRequestException('未能识别税额，请手动填写开票税额');
    }

    const person = await this.resolvePerson(body);
    const collectionId = body?.collectionId ? Number(body.collectionId) : null;
    const created = await this.prisma.financeInvoice.create({
      data: {
        month,
        collectionId: Number.isFinite(collectionId) && collectionId > 0 ? collectionId : null,
        userId: person.userId,
        userName: person.userName,
        title: String(body?.title || parsed.title || '').trim().slice(0, 80),
        invoiceNo: String(body?.invoiceNo || parsed.invoiceNo || '').trim().slice(0, 40),
        sellerName: String(body?.sellerName || parsed.sellerName || '').trim().slice(0, 80),
        amountCents: Math.round((Number(amount) || 0) * 100),
        taxCents: Math.round(Number(tax) * 100),
        pdfPath,
        rawText: parsed.rawText,
        status: body?.status === 'draft' ? 'draft' : 'confirmed',
        note: String(body?.note || '').trim().slice(0, 120),
        createdBy: adminId || null,
      },
    });
    await this.reserves.syncInvoiceReserve(created, { adminId: adminId || null });
    const taxText = `¥${(created.taxCents / 100).toFixed(2)}`;
    let tip = `已识别税额 ${taxText}`;
    if (!created.collectionId) tip += '，请关联合集后才会扣除';
    else if (created.userId || created.userName) tip += `，将从「${created.userName || '关联人员'}」的分成中扣除`;
    else tip += '，将从关联合集的分成池中扣除';
    if (created.status === 'confirmed' && created.taxCents > 0) tip += '；税额已计入对公预留';
    return {
      ...this.present(created),
      parsed: {
        invoiceNo: parsed.invoiceNo,
        sellerName: parsed.sellerName,
        amount: parsed.amount,
        tax: parsed.tax,
        title: parsed.title,
      },
      tip,
    };
  }

  private async normalize(body: any) {
    const month = String(body?.month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('月份格式应为 YYYY-MM');
    const tax = Number(body?.tax);
    if (!Number.isFinite(tax) || tax < 0) throw new BadRequestException('请填写开票税额（≥0）');
    const amount = body?.amount == null || body.amount === '' ? tax : Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException('价税合计不正确');
    const collectionId = body?.collectionId === '' || body?.collectionId == null ? null : Number(body.collectionId);
    if (collectionId != null && (!Number.isFinite(collectionId) || collectionId <= 0)) {
      throw new BadRequestException('合集不正确');
    }
    const person = await this.resolvePerson(body);
    return {
      month,
      collectionId,
      userId: person.userId,
      userName: person.userName,
      title: String(body?.title || '').trim().slice(0, 80),
      invoiceNo: String(body?.invoiceNo || '').trim().slice(0, 40),
      sellerName: String(body?.sellerName || '').trim().slice(0, 80),
      amountCents: Math.round(amount * 100),
      taxCents: Math.round(tax * 100),
      pdfPath: String(body?.pdfPath || '').trim().slice(0, 200),
      rawText: String(body?.rawText || '').trim().slice(0, 20000),
      status: body?.status === 'draft' ? 'draft' : 'confirmed',
      note: String(body?.note || '').trim().slice(0, 120),
    };
  }

  private async resolvePerson(body: any): Promise<{ userId: number | null; userName: string }> {
    const rawId = body?.userId === '' || body?.userId == null ? null : Number(body.userId);
    const nameOnly = String(body?.userName || '').trim().slice(0, 40);
    if (rawId != null) {
      if (!Number.isFinite(rawId) || rawId <= 0) throw new BadRequestException('承担人不正确');
      const user = await this.prisma.user.findUnique({
        where: { id: rawId },
        select: { id: true, nickname: true, phone: true, teacherCert: { select: { realName: true } } },
      });
      if (!user) throw new BadRequestException('承担人不存在');
      const userName = user.teacherCert?.realName || user.nickname || (user.phone ? `用户${String(user.phone).slice(-4)}` : `用户#${user.id}`);
      return { userId: user.id, userName };
    }
    if (nameOnly) return { userId: null, userName: nameOnly };
    return { userId: null, userName: '' };
  }

  private present(row: {
    id: number;
    month: string;
    collectionId: number | null;
    userId?: number | null;
    userName?: string;
    title: string;
    invoiceNo: string;
    sellerName: string;
    amountCents: number;
    taxCents: number;
    pdfPath: string;
    status: string;
    note: string;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      month: row.month,
      collectionId: row.collectionId,
      userId: row.userId ?? null,
      userName: row.userName || '',
      title: row.title,
      invoiceNo: row.invoiceNo,
      sellerName: row.sellerName,
      amount: row.amountCents / 100,
      tax: row.taxCents / 100,
      pdfPath: row.pdfPath,
      status: row.status,
      note: row.note,
      createdAt: row.createdAt,
      personal: !!(row.userId || row.userName),
    };
  }
}
