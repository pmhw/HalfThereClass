import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '@/common/prisma/prisma.service';

const MAX_SHARES_PER_OWNER = 30;
const DEFAULT_EXPIRE_DAYS = 7;

type DiyPayload = {
  cfg?: Record<string, unknown>;
  entries?: unknown[];
};

@Injectable()
export class DiyPosterService {
  constructor(private prisma: PrismaService) {}

  private newToken() {
    return randomBytes(18).toString('base64url');
  }

  private parsePayload(raw: string): DiyPayload {
    try {
      const data = JSON.parse(raw || '{}');
      return {
        cfg: data?.cfg && typeof data.cfg === 'object' ? data.cfg : {},
        entries: Array.isArray(data?.entries) ? data.entries : [],
      };
    } catch {
      return { cfg: {}, entries: [] };
    }
  }

  private serializePayload(payload: DiyPayload) {
    return JSON.stringify({
      cfg: payload?.cfg && typeof payload.cfg === 'object' ? payload.cfg : {},
      entries: Array.isArray(payload?.entries) ? payload.entries : [],
    });
  }

  private assertAlive(row: { expiresAt: Date | null }) {
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('临时链接已过期');
    }
  }

  private publicView(row: any) {
    const payload = this.parsePayload(row.payload);
    return {
      id: row.id,
      token: row.token,
      title: row.title,
      revision: row.revision,
      expiresAt: row.expiresAt,
      updatedAt: row.updatedAt,
      cfg: payload.cfg,
      entries: payload.entries,
    };
  }

  private adminView(row: any) {
    return {
      ...this.publicView(row),
      ownerId: row.ownerId,
      createdAt: row.createdAt,
      sharePath: `/diy/${row.token}`,
    };
  }

  async listMine(ownerId: number) {
    const rows = await this.prisma.diyPosterShare.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.adminView(row));
  }

  async create(ownerId: number, body: { title?: string; expireDays?: number | null; cfg?: Record<string, unknown>; entries?: unknown[] }) {
    const count = await this.prisma.diyPosterShare.count({ where: { ownerId } });
    if (count >= MAX_SHARES_PER_OWNER) {
      throw new BadRequestException(`最多同时保留 ${MAX_SHARES_PER_OWNER} 条临时链接，请先关闭不用的`);
    }
    const title = String(body?.title || '').trim() || `临时课表 ${new Date().toISOString().slice(0, 10)}`;
    const days = body?.expireDays === null || body?.expireDays === 0
      ? null
      : Math.min(90, Math.max(1, Number(body?.expireDays) || DEFAULT_EXPIRE_DAYS));
    const expiresAt = days == null ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const row = await this.prisma.diyPosterShare.create({
      data: {
        token: this.newToken(),
        title,
        ownerId,
        payload: this.serializePayload({ cfg: body?.cfg, entries: body?.entries }),
        expiresAt,
      },
    });
    return this.adminView(row);
  }

  async getMine(ownerId: number, id: string, since?: number) {
    const row = await this.prisma.diyPosterShare.findFirst({ where: { id, ownerId } });
    if (!row) throw new NotFoundException('临时链接不存在');
    this.assertAlive(row);
    if (since != null && Number(since) === row.revision) {
      return { unchanged: true, revision: row.revision, updatedAt: row.updatedAt };
    }
    return this.adminView(row);
  }

  async updateMine(
    ownerId: number,
    id: string,
    body: { title?: string; revision?: number; cfg?: Record<string, unknown>; entries?: unknown[]; expireDays?: number | null },
  ) {
    const row = await this.prisma.diyPosterShare.findFirst({ where: { id, ownerId } });
    if (!row) throw new NotFoundException('临时链接不存在');
    this.assertAlive(row);
    if (body.revision != null && Number(body.revision) !== row.revision) {
      throw new ConflictException('内容已在其他端更新，请刷新后再试');
    }
    const data: any = { revision: row.revision + 1 };
    if (body.title != null) data.title = String(body.title || '').trim() || row.title;
    if (body.cfg != null || body.entries != null) {
      const cur = this.parsePayload(row.payload);
      data.payload = this.serializePayload({
        cfg: body.cfg != null ? body.cfg : cur.cfg,
        entries: body.entries != null ? body.entries : cur.entries,
      });
    }
    if (body.expireDays !== undefined) {
      const days = body.expireDays === null || body.expireDays === 0
        ? null
        : Math.min(90, Math.max(1, Number(body.expireDays) || DEFAULT_EXPIRE_DAYS));
      data.expiresAt = days == null ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }
    const saved = await this.prisma.diyPosterShare.update({ where: { id: row.id }, data });
    return this.adminView(saved);
  }

  async removeMine(ownerId: number, id: string) {
    const row = await this.prisma.diyPosterShare.findFirst({ where: { id, ownerId } });
    if (!row) throw new NotFoundException('临时链接不存在');
    await this.prisma.diyPosterShare.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async getByToken(token: string, since?: number) {
    const row = await this.prisma.diyPosterShare.findUnique({ where: { token: String(token || '') } });
    if (!row) throw new NotFoundException('临时链接无效');
    this.assertAlive(row);
    if (since != null && Number(since) === row.revision) {
      return { unchanged: true, revision: row.revision, updatedAt: row.updatedAt };
    }
    return this.publicView(row);
  }

  async updateByToken(
    token: string,
    body: { revision?: number; cfg?: Record<string, unknown>; entries?: unknown[]; title?: string },
  ) {
    const row = await this.prisma.diyPosterShare.findUnique({ where: { token: String(token || '') } });
    if (!row) throw new NotFoundException('临时链接无效');
    this.assertAlive(row);
    if (body.revision != null && Number(body.revision) !== row.revision) {
      throw new ConflictException('内容已在其他端更新，请刷新后再试');
    }
    const cur = this.parsePayload(row.payload);
    const data: any = {
      revision: row.revision + 1,
      payload: this.serializePayload({
        cfg: body.cfg != null ? body.cfg : cur.cfg,
        entries: body.entries != null ? body.entries : cur.entries,
      }),
    };
    if (body.title != null) data.title = String(body.title || '').trim() || row.title;
    const saved = await this.prisma.diyPosterShare.update({ where: { id: row.id }, data });
    return this.publicView(saved);
  }
}
