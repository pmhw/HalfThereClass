import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AdminPermissionGuard } from '@/common/guards/admin-permission.guard';
import { Perm } from '@/modules/admin/admin.permissions';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { StaffService } from './staff.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class StaffAdminController {
  constructor(private staff: StaffService) {}

  @Perm('people.user')
  @Get('people')
  people(@Query() query: any) {
    return this.staff.people(query);
  }

  @Perm('people.user')
  @Get('people/:id/merge-candidates')
  mergeCandidates(@Param('id') id: string) {
    return this.staff.mergeCandidates(Number(id));
  }

  @Perm('people.user')
  @Get('people/:id/merge-preview')
  mergePreview(@Param('id') id: string, @Query('with') other: string) {
    return this.staff.mergePreview(Number(id), Number(other));
  }

  @Perm('people.user')
  @Post('people/merge')
  mergeUsers(@Body() body: { keeperId?: number; donorId?: number }) {
    return this.staff.mergeUsers(Number(body?.keeperId), Number(body?.donorId));
  }

  @Perm('people.user')
  @Delete('people/:id')
  deleteUser(@Param('id') id: string) {
    return this.staff.deleteUser(Number(id));
  }

  @Perm('people.user', 'people.teacher', 'course.assign', 'org.list')
  @Get('faculty')
  faculty() {
    return this.staff.faculty();
  }

  @Perm('people.teacher')
  @Get('faculty/:id')
  facultyDetail(@Param('id') id: string) {
    return this.staff.teacherDetail(Number(id));
  }

  @Perm('people.user', 'people.teacher', 'org.list')
  @Put('faculty/:id/org')
  setOrg(@Param('id') id: string, @Body() body: { organizationId?: number | null }) {
    return this.staff.setOrg(Number(id), body.organizationId ? Number(body.organizationId) : null);
  }

  @Perm('people.user', 'people.teacher')
  @Put('faculty/:id/parent')
  setParent(@Param('id') id: string, @Body() body: { parentId?: number | null }) {
    return this.staff.setParent(Number(id), body.parentId ? Number(body.parentId) : null);
  }

  @Perm('people.user', 'people.teacher')
  @Put('faculty/:id/freeze')
  freeze(@Param('id') id: string, @Body() body: { frozen?: boolean }) {
    return this.staff.freeze(Number(id), !!body.frozen);
  }

  @Perm('course.assign')
  @Get('grants')
  listGrants() {
    return this.staff.listGrants();
  }

  @Perm('course.assign')
  @Post('faculty/:id/grants')
  grant(@Param('id') id: string, @Body() body: any) {
    return this.staff.saveGrant(Number(id), body);
  }

  @Perm('course.assign')
  @Delete('faculty/:id/grants/:courseId')
  revokeGrant(@Param('id') id: string, @Param('courseId') courseId: string, @Query('from') from?: string) {
    return this.staff.revokeGrant(Number(id), Number(courseId), from);
  }

  @Perm('people.cert')
  @Get('certs')
  certs() {
    return this.staff.certs();
  }

  @Perm('people.cert')
  @Get('certs/pending-count')
  certsPendingCount() {
    return this.staff.certsPendingCount();
  }

  @Perm('people.cert')
  @Get('contracts')
  contracts(@Query('status') status?: string) {
    return this.staff.listContracts(status);
  }

  @Perm('people.cert', 'people.teacher')
  @Post('contracts/:id/review')
  reviewContract(
    @Param('id') id: string,
    @Body() body: { action: string; reason?: string },
    @Req() req: any,
  ) {
    return this.staff.reviewContract(Number(id), body.action, body.reason, Number(req.user?.adminId) || undefined);
  }

  @Perm('people.cert', 'people.teacher')
  @Post('contracts/:id/revoke')
  revokeContract(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    return this.staff.revokeContract(Number(id), body.reason, Number(req.user?.adminId) || undefined);
  }

  @Perm('people.teacher')
  @Post('faculty/:id/revoke-contract')
  revokeFacultyContract(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    return this.staff.revokeTeacherContract(Number(id), body.reason, Number(req.user?.adminId) || undefined);
  }

  @Perm('people.teacher')
  @Post('faculty/:id/reset-bank')
  resetFacultyBank(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    return this.staff.resetTeacherBank(Number(id), body.reason, Number(req.user?.adminId) || undefined);
  }

  @Perm('people.cert')
  @Post('certs/:userId/review')
  review(@Param('userId') userId: string, @Body() body: { action: string; reason?: string; rejectFields?: string[] }) {
    return this.staff.review(Number(userId), body.action, body.reason, body.rejectFields);
  }

  @Perm('org.list', 'people.user', 'people.teacher')
  @Get('orgs')
  orgs() {
    return this.staff.orgs();
  }

  @Perm('org.list')
  @Post('orgs')
  createOrg(@Body() body: any) {
    return this.staff.saveOrg(body);
  }

  @Perm('org.list')
  @Put('orgs/:id')
  updateOrg(@Param('id') id: string, @Body() body: any) {
    return this.staff.saveOrg(body, Number(id));
  }

  @Perm('org.list')
  @Get('orgs/:id')
  orgDetail(@Param('id') id: string) {
    return this.staff.orgDetail(Number(id));
  }

  @Perm('org.list')
  @Post('orgs/:id/teachers')
  bindOrgTeachers(
    @Param('id') id: string,
    @Body() body: { userIds?: number[] },
  ) {
    return this.staff.bindOrgTeachers(Number(id), body?.userIds || []);
  }

  @Perm('org.list')
  @Post('orgs/:id/courses')
  assignOrgCourse(
    @Param('id') id: string,
    @Body() body: { courseId: number; commissionMode?: string; commissionValue?: number | string },
  ) {
    return this.staff.assignOrgCourse(Number(id), body);
  }

  @Perm('org.list')
  @Delete('orgs/:id/courses/:courseId')
  unassignOrgCourse(@Param('id') id: string, @Param('courseId') courseId: string) {
    return this.staff.unassignOrgCourse(Number(id), Number(courseId));
  }

  @Perm('course.assign')
  @Get('fees/preview')
  preview(@Query() query: any) {
    return this.staff.preview({
      ...query,
      hasOrg: query.hasOrg === '1' || query.hasOrg === 'true',
      courseOrg: query.courseOrg === '1' || query.courseOrg === 'true' || query.splitMode === 'course_org',
    });
  }

  @Perm('course.assign', 'finance.teacher')
  @Get('incomes')
  incomes() {
    return this.staff.incomes();
  }

  @Perm('finance.reimburse')
  @Get('reimbursements')
  reimbursements(@Query('status') status?: string, @Query('month') month?: string) {
    return this.staff.listReimbursements({ status, month });
  }

  @Perm('finance.reimburse')
  @Get('reimbursements/collections')
  reimbursementCollections() {
    return this.staff.reimbursementCollections();
  }

  @Perm('finance.reimburse')
  @Get('reimbursements/pending-count')
  reimbursementsPendingCount() {
    return this.staff.reimbursementsPendingCount();
  }

  @Perm('finance.reimburse')
  @Get('reimbursements/teachers')
  reimbursementTeachers() {
    return this.staff.reimbursementTeachers();
  }

  @Perm('finance.reimburse')
  @Post('reimbursements')
  createReimbursement(@Body() body: any, @Req() req: any) {
    return this.staff.adminCreateReimbursement(body, Number(req.user?.adminId) || undefined);
  }

  @Perm('finance.reimburse')
  @Post('reimbursements/receipt')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadReimbursementReceipt(@UploadedFile() file: { buffer?: Buffer }) {
    return this.staff.saveReimbursementReceipt(file);
  }

  @Perm('finance.reimburse')
  @Post('reimbursements/:id/review')
  reviewReimbursement(
    @Param('id') id: string,
    @Body() body: { action: string; reason?: string; month?: string; splitCollectionId?: number | null },
    @Req() req: any,
  ) {
    return this.staff.reviewReimbursement(
      Number(id),
      body.action,
      body.reason,
      Number(req.user?.adminId) || undefined,
      { month: body.month, splitCollectionId: body.splitCollectionId },
    );
  }

  @Perm('finance.reimburse')
  @Put('reimbursements/:id/deduction')
  updateReimbursementDeduction(
    @Param('id') id: string,
    @Body() body: { month?: string; splitCollectionId?: number | null; attachments?: string[]; amount?: number | string },
  ) {
    return this.staff.updateReimbursementDeduction(Number(id), body || {});
  }

  @Perm('finance.reimburse')
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
