import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AdminPermissionGuard } from '@/common/guards/admin-permission.guard';
import { Perm } from '@/modules/admin/admin.permissions';
import { FinanceService } from './finance.service';
import { BankTxnService } from './bank.service';

@Controller('admin/finance')
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class FinanceAdminController {
  constructor(
    private finance: FinanceService,
    private bank: BankTxnService,
  ) {}

  @Perm('finance.overview')
  @Get('overview')
  overview(@Query('month') month?: string, @Query('organizationId') organizationId?: string) {
    return this.finance.overview(month, {
      organizationId: organizationId ? Number(organizationId) : null,
    });
  }

  @Perm('finance.overview')
  @Get('school-value')
  schoolValue() {
    return this.finance.schoolValues();
  }

  @Perm('finance.overview')
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

  @Perm('finance.overview')
  @Get('months/:month/courses')
  monthCourses(@Param('month') month: string, @Query('organizationId') organizationId?: string) {
    return this.finance.monthCourses(month, {
      organizationId: organizationId ? Number(organizationId) : null,
    });
  }

  @Perm('finance.teacher')
  @Get('teachers')
  teachers(@Query('month') month?: string, @Query('organizationId') organizationId?: string) {
    return this.finance.teacherStats(month, {
      organizationId: organizationId ? Number(organizationId) : null,
    });
  }

  @Perm('finance.teacher')
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

  @Perm('finance.org')
  @Get('orgs')
  orgs(@Query('month') month?: string) {
    return this.finance.orgStats(month);
  }

  @Perm('finance.org')
  @Get('org-profit')
  orgProfit(
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.finance.orgProfitDetail({
      month,
      from,
      to,
      organizationId: organizationId ? Number(organizationId) : null,
    });
  }

  @Perm('finance.statement')
  @Get('statement')
  statement(@Query('month') month: string) {
    return this.finance.monthlyStatement(month);
  }

  @Perm('finance.statement')
  @Post('statement/:month/lock')
  lockMonth(@Param('month') month: string, @Body() body: { note?: string }, @Req() req: any) {
    return this.finance.lockMonth(month, Number(req.user?.adminId) || undefined, body?.note);
  }

  @Perm('finance.statement')
  @Post('statement/:month/unlock')
  unlockMonth(@Param('month') month: string) {
    return this.finance.unlockMonth(month);
  }

  @Perm('finance.split')
  @Get('split')
  split(@Query('month') month?: string) {
    return this.finance.splitOverview(month);
  }

  @Perm('finance.split')
  @Put('split/config')
  saveSplitConfig(@Body() body: any) {
    return this.finance.saveSplitConfig(body);
  }

  @Perm('finance.split')
  @Post('split/collections')
  createSplit(@Body() body: any) {
    return this.finance.createSplitCollection(body);
  }

  @Perm('finance.split')
  @Put('split/collections/:id')
  updateSplit(@Param('id') id: string, @Body() body: any) {
    return this.finance.updateSplitCollection(Number(id), body);
  }

  @Perm('finance.split')
  @Delete('split/collections/:id')
  deleteSplit(@Param('id') id: string) {
    return this.finance.deleteSplitCollection(Number(id));
  }

  @Perm('finance.split', 'finance.sheet', 'finance.payout')
  @Get('split/sheet')
  splitSheet(@Query('month') month?: string) {
    return this.finance.splitSheet(month);
  }

  @Perm('finance.payout')
  @Get('payouts')
  payouts(@Query('month') month?: string) {
    return this.finance.splitPayouts(month);
  }

  @Perm('finance.payout')
  @Post('payouts/:month/mark')
  markPayouts(@Param('month') month: string, @Body() body: any, @Req() req: any) {
    return this.finance.markSplitPayouts(month, body, Number(req.user?.adminId) || undefined);
  }

  @Perm('finance.org')
  @Get('orgs/:id')
  orgDetail(@Param('id') id: string, @Query('month') month?: string) {
    return this.finance.orgDetail(Number(id), month);
  }

  @Perm('finance.rule')
  @Get('rules')
  rules() {
    return this.finance.listRules();
  }

  @Perm('finance.rule')
  @Put('rules/:courseId')
  saveRule(@Param('courseId') courseId: string, @Body() body: any) {
    return this.finance.saveCourseRule(Number(courseId), body);
  }

  @Perm('finance.overview')
  @Get('sync-courses')
  syncCourses() {
    return this.finance.listSyncCourses();
  }

  @Perm('finance.overview')
  @Post('sync')
  sync(@Body() body: { courseIds?: number[] }) {
    return this.finance.syncAllSessions({ courseIds: body?.courseIds || [] });
  }

  @Perm('finance.overview')
  @Post('settle/:month')
  settle(@Param('month') month: string, @Body() body: { note?: string }, @Req() req: any) {
    return this.finance.settleMonth(month, Number(req.user?.adminId) || undefined, body?.note);
  }

  @Perm('finance.overview')
  @Post('reopen/:month')
  reopen(@Param('month') month: string) {
    return this.finance.reopenMonth(month);
  }

  @Perm('trade.order')
  @Post('orders/:id/paid')
  markPaid(@Param('id') id: string, @Body() body: { payAmount?: number }) {
    return this.finance.markOrderPaid(Number(id), body?.payAmount);
  }

  @Perm('trade.order')
  @Post('orders/:id/refund')
  refund(@Param('id') id: string, @Body() body: { refundAmount?: number }) {
    return this.finance.markOrderRefunded(Number(id), body?.refundAmount);
  }

  @Perm('finance.bank')
  @Get('bank-txns')
  bankTxns() {
    return this.bank.list();
  }

  @Perm('finance.bank')
  @Post('bank-txns/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  importBankTxns(@UploadedFile() file?: { buffer?: Buffer }) {
    if (!file?.buffer?.length) throw new BadRequestException('请上传交易查询文件');
    return this.bank.importWorkbook(file.buffer);
  }

  @Perm('finance.bank')
  @Post('bank-txns/:id/allocs')
  allocateBankTxn(@Param('id') id: string, @Body() body: { userId?: number | null; name?: string; amount?: number; note?: string }) {
    return this.bank.allocate(Number(id), body);
  }

  @Perm('finance.bank')
  @Put('bank-txns/allocs/:id/lock')
  lockBankAlloc(@Param('id') id: string, @Body() body: { locked?: boolean }) {
    return this.bank.setLock(Number(id), body?.locked !== false);
  }

  @Perm('finance.bank')
  @Delete('bank-txns/allocs/:id')
  removeBankAlloc(@Param('id') id: string) {
    return this.bank.removeAlloc(Number(id));
  }
}
