import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AdminPermissionGuard } from '@/common/guards/admin-permission.guard';
import { SchoolPerm } from '@/modules/admin/admin.permissions';
import { DiyPosterService } from './diy-poster.service';

@Controller('admin/diy-poster')
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class DiyPosterAdminController {
  constructor(private service: DiyPosterService) {}

  @Get('shares')
  @SchoolPerm('course.list', 'course.term')
  list(@Req() req: any) {
    return this.service.listMine(Number(req.admin.id));
  }

  @Post('shares')
  @SchoolPerm('course.list', 'course.term')
  create(@Req() req: any, @Body() body: any) {
    return this.service.create(Number(req.admin.id), body || {});
  }

  @Get('shares/:id')
  @SchoolPerm('course.list', 'course.term')
  get(@Req() req: any, @Param('id') id: string, @Query('since') since?: string) {
    return this.service.getMine(Number(req.admin.id), id, since != null && since !== '' ? Number(since) : undefined);
  }

  @Put('shares/:id')
  @SchoolPerm('course.list', 'course.term')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.service.updateMine(Number(req.admin.id), id, body || {});
  }

  @Delete('shares/:id')
  @SchoolPerm('course.list', 'course.term')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.removeMine(Number(req.admin.id), id);
  }
}

/** 免登录：凭 token 读写 DIY 课表 */
@Controller('diy-poster')
export class DiyPosterPublicController {
  constructor(private service: DiyPosterService) {}

  @Get('share/:token')
  get(@Param('token') token: string, @Query('since') since?: string) {
    return this.service.getByToken(token, since != null && since !== '' ? Number(since) : undefined);
  }

  @Put('share/:token')
  update(@Param('token') token: string, @Body() body: any) {
    return this.service.updateByToken(token, body || {});
  }
}
