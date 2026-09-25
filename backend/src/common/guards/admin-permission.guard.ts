import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { parsePermissions, permissionFor } from '@/modules/admin/admin.permissions';

type CachedAdmin = {
  at: number;
  admin: any;
};

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  private static cache = new Map<number, CachedAdmin>();
  private static readonly TTL_MS = 8_000;

  constructor(private prisma: PrismaService) {}

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
    const path = String(request.originalUrl || request.url || '').split('?')[0];
    const method = String(request.method || 'GET').toUpperCase();
    if (method === 'GET' && /\/session(?:\/|$)/.test(path)) return true;
    // 角标轻量接口不重复鉴权业务权限
    if (method === 'GET' && /\/(certs\/pending-count|dashboard\/pending-count)(?:\/|$)/.test(path)) {
      return true;
    }
    // 数据库导入/导出与在线更新只允许超级管理员
    if (/\/system\/(database|apply-update)(?:\/|$)/.test(path)) {
      if (!admin.isSuper) throw new ForbiddenException('仅超级管理员可操作数据库与在线更新');
      return true;
    }
    if (admin.role === 'school') return this.allowSchool(request);
    if (admin.isSuper) return true;
    const need = permissionFor(request.originalUrl || request.url);
    if (!need || !parsePermissions(admin.permissions).includes(need)) {
      throw new ForbiddenException('没有该功能权限');
    }
    return true;
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

  private allowSchool(request: any) {
    const path = String(request.originalUrl || request.url || '').split('?')[0];
    const method = String(request.method || 'GET').toUpperCase();
    if (/\/(courses|categories|semesters|holidays|sessions)(?:\/|$)/.test(path)) return true;
    if (method === 'GET' && /\/(schools|teachers)(?:\/|$)/.test(path)) return true;
    throw new ForbiddenException('校企业账号只能管理自己的课程、分类和排课');
  }
}
