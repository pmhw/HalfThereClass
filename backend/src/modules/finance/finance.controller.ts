import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AdminPermissionGuard } from '@/common/guards/admin-permission.guard';
import { FinanceService } from './finance.service';

@Controller('admin/finance')
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class FinanceAdminController {
  constructor(private finance: FinanceService) {}

  @Get('overview')
  overview(@Query('month') month?: string, @Query('organizationId') organizationId?: string) {
    return this.finance.overview(month, {
      organizationId: organizationId ? Number(organizationId) : null,
    });
  }

  @Get('monthly')
  monthly(
    @Query('year') year?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('group') group?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.finance.monthlyTable({
      year: year ? Number(year) : undefined,
      from,
      to,
      group,
      scope: { organizationId: organizationId ? Number(organizationId) : null },
    });
  }

  @Get('months/:month/courses')
  monthCourses(@Param('month') month: string, @Query('organizationId') organizationId?: string) {
    return this.finance.monthCourses(month, {
      organizationId: organizationId ? Number(organizationId) : null,
    });
  }

  @Get('teachers')
  teachers(@Query('month') month?: string, @Query('organizationId') organizationId?: string) {
    return this.finance.teacherStats(month, {
      organizationId: organizationId ? Number(organizationId) : null,
    });
  }

  @Get('teachers/:id')
  teacherDetail(
    @Param('id') id: string,
    @Query('month') month?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.finance.teacherDetail(Number(id), month, {
      organizationId: organizationId ? Number(organizationId) : null,
    });
  }

  @Get('orgs')
  orgs(@Query('month') month?: string) {
    return this.finance.orgStats(month);
  }

  @Get('orgs/:id')
  orgDetail(@Param('id') id: string, @Query('month') month?: string) {
    return this.finance.orgDetail(Number(id), month);
  }

  @Get('rules')
  rules() {
    return this.finance.listRules();
  }

  @Put('rules/:courseId')
  saveRule(@Param('courseId') courseId: string, @Body() body: any) {
    return this.finance.saveCourseRule(Number(courseId), body);
  }

  @Post('sync')
  sync() {
    return this.finance.syncAllSessions();
  }

  @Post('settle/:month')
  settle(@Param('month') month: string, @Body() body: { note?: string }, @Req() req: any) {
    return this.finance.settleMonth(month, Number(req.user?.adminId) || undefined, body?.note);
  }

  @Post('reopen/:month')
  reopen(@Param('month') month: string) {
    return this.finance.reopenMonth(month);
  }

  @Post('orders/:id/paid')
  markPaid(@Param('id') id: string, @Body() body: { payAmount?: number }) {
    return this.finance.markOrderPaid(Number(id), body?.payAmount);
  }

  @Post('orders/:id/refund')
  refund(@Param('id') id: string, @Body() body: { refundAmount?: number }) {
    return this.finance.markOrderRefunded(Number(id), body?.refundAmount);
  }
}
