import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ADMIN_ACCESS_KEY, AdminAccessRule, isFinanceRule, parsePermissions } from '@/modules/admin/admin.permissions';
import { FINANCE_TOKEN_HEADER, issueFinanceToken, loadSharedFinancePin, readFinanceToken } from '@/common/finance-pin';

type CachedAdmin = {
  at: number;
  admin: any;
};

/**
 * 后台接口鉴权：每个接口必须用 @AdminAccess / @Perm 声明所需权限，按声明校验，不再按 URL 关键字猜测。
 * 未声明的接口只允许超级管理员访问（失败即拒绝）。
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
  private static cache = new Map<number, CachedAdmin>();
  private static readonly TTL_MS = 8_000;

  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (user?.role !== 'admin' || !user.adminId) throw new ForbiddenException('没有管理权限');
    const adminId = Number(user.adminId);
    const admin = await this.loadAdmin(adminId);
    if (!admin || admin.status !== 1) {
      AdminPermissionGuard.cache.delete(adminId);
      throw new ForbiddenException('账号已停用');
    }
    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      const pad = (value: number) => `${value}`.padStart(2, '0');
      const time = `${pad(admin.lockedUntil.getHours())}:${pad(admin.lockedUntil.getMinutes())}`;
      throw new ForbiddenException(`账号已冻结，请于 ${time} 后再试`);
    }
    request.admin = admin;

    const rule = this.reflector.getAllAndOverride<AdminAccessRule | undefined>(ADMIN_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule?.superOnly) {
      if (!admin.isSuper) throw new ForbiddenException('仅超级管理员可操作');
      await this.keepFinancePin(context, admin);
      return true;
    }
    if (admin.role === 'school') {
      if (rule?.school) return true;
      throw new ForbiddenException('校企业账号只能管理自己的课程、分类和排课');
    }
    if (!admin.isSuper) {
      if (!rule?.perms) throw new ForbiddenException('没有该功能权限');
      if (rule.perms !== 'any') {
        const own = new Set<string>(parsePermissions(admin.permissions));
        if (!rule.perms.some((key) => own.has(key))) throw new ForbiddenException('没有该功能权限');
      }
    }
    if (isFinanceRule(rule)) await this.checkFinancePin(context, admin);
    else await this.keepFinancePin(context, admin);
    return true;
  }

  /** 财务接口：需先输入财务密码（全员共用），凭证快到期时随响应续期 */
  private async checkFinancePin(context: ExecutionContext, admin: any) {
    const shared = await loadSharedFinancePin(this.prisma);
    if (!shared) {
      throw new ForbiddenException({ message: '还没有设置财务密码，请在「系统设置 → 财务密码」中设置', reason: 'finance_pin_unset' });
    }
    const request = context.switchToHttp().getRequest();
    const hit = readFinanceToken(String(request.headers[FINANCE_TOKEN_HEADER] || ''), admin.id, shared.at);
    if (!hit) throw new ForbiddenException({ message: '请输入财务密码', reason: 'finance_pin' });
    if (hit.renew) this.renewFinanceToken(context, admin.id, shared.at);
  }

  /** 非财务接口：已解锁的凭证同样续期，在后台其他页面操作时不会过期 */
  private async keepFinancePin(context: ExecutionContext, admin: any) {
    const request = context.switchToHttp().getRequest();
    const token = request.headers[FINANCE_TOKEN_HEADER];
    if (!token) return;
    const shared = await loadSharedFinancePin(this.prisma);
    if (!shared) return;
    const hit = readFinanceToken(String(token), admin.id, shared.at);
    if (hit?.renew) this.renewFinanceToken(context, admin.id, shared.at);
  }

  private renewFinanceToken(context: ExecutionContext, adminId: number, version: number) {
    const next = issueFinanceToken(adminId, version);
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-Finance-Token', next.token);
    response.setHeader('X-Finance-Expires', String(next.expiresAt));
  }

  private async loadAdmin(adminId: number) {
    const hit = AdminPermissionGuard.cache.get(adminId);
    if (hit && Date.now() - hit.at < AdminPermissionGuard.TTL_MS) return hit.admin;
    const admin = await this.prisma.adminAccount.findUnique({ where: { id: adminId } });
    if (admin) AdminPermissionGuard.cache.set(adminId, { at: Date.now(), admin });
    return admin;
  }

  /** 冻结/改权限后清缓存 */
  static invalidate(adminId?: number) {
    if (adminId) AdminPermissionGuard.cache.delete(Number(adminId));
    else AdminPermissionGuard.cache.clear();
  }
}
