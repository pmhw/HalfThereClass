import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AdminPermissionGuard } from '@/common/guards/admin-permission.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { StaffService } from './staff.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class StaffAdminController {
  constructor(private staff: StaffService) {}

  @Get('people')
  people(@Query() query: any) {
    return this.staff.people(query);
  }

  @Get('faculty')
  faculty() {
    return this.staff.faculty();
  }

  @Get('faculty/:id')
  facultyDetail(@Param('id') id: string) {
    return this.staff.teacherDetail(Number(id));
  }

  @Put('faculty/:id/org')
  setOrg(@Param('id') id: string, @Body() body: { organizationId?: number | null }) {
    return this.staff.setOrg(Number(id), body.organizationId ? Number(body.organizationId) : null);
  }

  @Put('faculty/:id/parent')
  setParent(@Param('id') id: string, @Body() body: { parentId?: number | null }) {
    return this.staff.setParent(Number(id), body.parentId ? Number(body.parentId) : null);
  }

  @Put('faculty/:id/freeze')
  freeze(@Param('id') id: string, @Body() body: { frozen?: boolean }) {
    return this.staff.freeze(Number(id), !!body.frozen);
  }

  @Get('grants')
  listGrants() {
    return this.staff.listGrants();
  }

  @Post('faculty/:id/grants')
  grant(@Param('id') id: string, @Body() body: any) {
    return this.staff.saveGrant(Number(id), body);
  }

  @Delete('faculty/:id/grants/:courseId')
  revokeGrant(@Param('id') id: string, @Param('courseId') courseId: string) {
    return this.staff.revokeGrant(Number(id), Number(courseId));
  }

  @Get('certs')
  certs() {
    return this.staff.certs();
  }

  @Get('certs/pending-count')
  certsPendingCount() {
    return this.staff.certsPendingCount();
  }

  @Get('contracts')
  contracts(@Query('status') status?: string) {
    return this.staff.listContracts(status);
  }

  @Post('contracts/:id/review')
  reviewContract(
    @Param('id') id: string,
    @Body() body: { action: string; reason?: string },
    @Req() req: any,
  ) {
    return this.staff.reviewContract(Number(id), body.action, body.reason, Number(req.user?.adminId) || undefined);
  }

  @Post('contracts/:id/revoke')
  revokeContract(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    return this.staff.revokeContract(Number(id), body.reason, Number(req.user?.adminId) || undefined);
  }

  @Post('faculty/:id/revoke-contract')
  revokeFacultyContract(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    return this.staff.revokeTeacherContract(Number(id), body.reason, Number(req.user?.adminId) || undefined);
  }

  @Post('certs/:userId/review')
  review(@Param('userId') userId: string, @Body() body: { action: string; reason?: string; rejectFields?: string[] }) {
    return this.staff.review(Number(userId), body.action, body.reason, body.rejectFields);
  }

  @Get('orgs')
  orgs() {
    return this.staff.orgs();
  }

  @Post('orgs')
  createOrg(@Body() body: any) {
    return this.staff.saveOrg(body);
  }

  @Put('orgs/:id')
  updateOrg(@Param('id') id: string, @Body() body: any) {
    return this.staff.saveOrg(body, Number(id));
  }

  @Get('orgs/:id')
  orgDetail(@Param('id') id: string) {
    return this.staff.orgDetail(Number(id));
  }

  @Get('fees/preview')
  preview(@Query() query: any) {
    return this.staff.preview({ ...query, hasOrg: query.hasOrg === '1' || query.hasOrg === 'true' });
  }

  @Get('incomes')
  incomes() {
    return this.staff.incomes();
  }

  @Get('reimbursements')
  reimbursements(@Query('status') status?: string) {
    return this.staff.listReimbursements({ status });
  }

  @Get('reimbursements/pending-count')
  reimbursementsPendingCount() {
    return this.staff.reimbursementsPendingCount();
  }

  @Post('reimbursements/:id/review')
  reviewReimbursement(
    @Param('id') id: string,
    @Body() body: { action: string; reason?: string },
    @Req() req: any,
  ) {
    return this.staff.reviewReimbursement(
      Number(id),
      body.action,
      body.reason,
      Number(req.user?.adminId) || undefined,
    );
  }

  @Post('reimbursements/:id/pay')
  markReimbursed(@Param('id') id: string, @Req() req: any) {
    return this.staff.markReimbursed(Number(id), Number(req.user?.adminId) || undefined);
  }
}

@Controller('teacher')
@UseGuards(JwtAuthGuard)
export class TeacherPortalController {
  constructor(private staff: StaffService) {}

  @Get('courses')
  courses(@CurrentUser('userId') userId: number) {
    return this.staff.myCourses(userId);
  }

  @Get('summary')
  summary(@CurrentUser('userId') userId: number) {
    return this.staff.mySummary(userId);
  }

  @Get('incomes')
  incomes(@CurrentUser('userId') userId: number) {
    return this.staff.myIncomes(userId);
  }

  @Get('reimbursements')
  reimbursements(@CurrentUser('userId') userId: number) {
    return this.staff.myReimbursements(userId);
  }

  @Post('reimbursements')
  createReimbursement(@CurrentUser('userId') userId: number, @Body() body: any) {
    return this.staff.createReimbursement(userId, body);
  }

  @Delete('reimbursements/:id')
  cancelReimbursement(@CurrentUser('userId') userId: number, @Param('id') id: string) {
    return this.staff.cancelReimbursement(userId, Number(id));
  }

  @Post('reimbursements/receipt')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadReceipt(@UploadedFile() file: { buffer?: Buffer }) {
    return this.staff.saveReimbursementReceipt(file);
  }
}
