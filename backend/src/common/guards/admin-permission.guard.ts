import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { parsePermissions, permissionFor } from '@/modules/admin/admin.permissions';

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (user?.role !== 'admin' || !user.adminId) throw new ForbiddenException('没有管理权限');
    const admin = await this.prisma.adminAccount.findUnique({ where: { id: Number(user.adminId) } });
    if (!admin || admin.status !== 1) throw new ForbiddenException('账号已停用');
    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      throw new ForbiddenException('账号已冻结，请稍后再试');
    }
    request.admin = admin;
    if (admin.isSuper) return true;
    const need = permissionFor(request.originalUrl || request.url);
    if (!need || !parsePermissions(admin.permissions).includes(need)) {
      throw new ForbiddenException('没有该功能权限');
    }
    return true;
  }
}
