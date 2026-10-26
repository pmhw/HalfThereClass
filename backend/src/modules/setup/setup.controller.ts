import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AdminPermissionGuard } from '@/common/guards/admin-permission.guard';
import { AdminAccess } from '@/modules/admin/admin.permissions';
import { SetupService } from './setup.service';

/** 配置检查：按分组权限过滤，任何管理员都可查看自己有权限的部分 */
@Controller('admin/setup')
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class SetupController {
  constructor(private setup: SetupService) {}

  @AdminAccess({ perms: 'any' })
  @Get('check')
  check(@Req() req: any) {
    return this.setup.check(req.admin);
  }

  @AdminAccess({ perms: 'any' })
  @Put('ignore/:id')
  ignore(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.setup.setIgnored(req.admin, id, body?.ignored !== false);
  }
}
