import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminLoginDto, CaptchaCheckDto } from './dto/admin-login.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AdminPermissionGuard } from '@/common/guards/admin-permission.guard';
import { AdminAccess, Perm, SchoolPerm } from '@/modules/admin/admin.permissions';
import { ScheduleService } from '../schedule/schedule.service';
import { ContractFlowService } from '../user/contract-flow.service';
import { FinanceService } from '../finance/finance.service';

@ApiTags('管理后台')
@Controller('admin')
export class AdminAuthController {
  constructor(private readonly adminService: AdminService) {}

  @Get('captcha')
  @ApiOperation({ summary: '登录滑块' })
  captcha(@Req() req: any) {
    return this.adminService.createCaptcha(req);
  }

  @Post('captcha/check')
  @ApiOperation({ summary: '核对滑块位置' })
  checkCaptcha(@Body() dto: CaptchaCheckDto, @Req() req: any) {
    return this.adminService.checkCaptcha(dto.captchaToken, dto.offset, req);
  }

  @Post('login')
  @ApiOperation({ summary: '管理员登录' })
  login(@Body() dto: AdminLoginDto, @Req() req: any) {
    return this.adminService.login(dto.username, dto.password, dto.captchaToken, dto.offset, req);
  }
}

@ApiTags('管理后台')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly scheduleService: ScheduleService,
    private readonly contractFlow: ContractFlowService,
    private readonly financeService: FinanceService,
  ) {}

  @AdminAccess({ perms: 'any', school: true })
  @Get('session')
  @ApiOperation({ summary: '检查当前账号是否被冻结或停用' })
  session(@Req() req: any) {
    return { ok: true, admin: this.adminService.profile(req.admin) };
  }

  @AdminAccess({ perms: 'any' })
  @Get('finance-pin')
  @ApiOperation({ summary: '当前账号是否已设置财务密码' })
  financePinStatus(@Req() req: any) {
    return this.adminService.financePinStatus(req.admin);
  }

  @AdminAccess({ perms: 'any' })
  @Put('finance-pin')
  @ApiOperation({ summary: '设置财务密码（首次需登录密码）/ 修改（需原财务密码）/ 超管用登录密码重置' })
  setFinancePin(@Req() req: any, @Body() body: { oldPin?: string; password?: string; pin?: string; reset?: boolean }) {
    return this.adminService.setFinancePin(Number(req.admin.id), {
      oldPin: String(body?.oldPin || ''),
      password: String(body?.password || ''),
      pin: String(body?.pin || ''),
      reset: body?.reset === true,
    });
  }

  @AdminAccess({ perms: 'any' })
  @Post('finance-pin/verify')
  @ApiOperation({ summary: '输入财务密码，换取财务解锁凭证（后台 2 小时无操作才过期）' })
  verifyFinancePin(@Req() req: any, @Body() body: { pin?: string }) {
    return this.adminService.verifyFinancePin(Number(req.admin.id), String(body?.pin || ''));
  }

  @Perm('home.overview')
  @Get('dashboard')
  @ApiOperation({ summary: '数据概览' })
  getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Perm('home.overview')
  @Get('dashboard/school-map')
  @ApiOperation({ summary: '首页经营地图（按学期统计，收益无需财务密码）' })
  getSchoolMap(@Query('semesterId') semesterId?: string) {
    const id = Number(semesterId);
    return this.adminService.getSchoolMap(Number.isFinite(id) && id > 0 ? id : undefined);
  }

  @Perm('course.school')
  @Put('dashboard/school-map/:id')
  @ApiOperation({ summary: '设置学校在经营地图里的类型与合作方式' })
  saveSchoolMapMeta(@Param('id') id: string, @Body() body: { type?: string; mode?: string }) {
    return this.adminService.saveSchoolMapMeta(Number(id), body || {});
  }

  @Perm('home.overview', 'trade.order')
  @Get('dashboard/pending-count')
  @ApiOperation({ summary: '待处理订单角标（轻量）' })
  getDashboardPendingCount() {
    return this.adminService.getDashboardPendingCount();
  }

  @Perm('admin.account')
  @Get('admins')
  @ApiOperation({ summary: '管理员列表' })
  getAdmins(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.adminService.listAdmins(Number(page), Number(pageSize), keyword);
  }

  @Perm('admin.account')
  @Get('admins/course-options')
  @ApiOperation({ summary: '可分配给校企业的课程' })
  courseOptions() {
    return this.adminService.courseOptions();
  }

  @Perm('admin.account')
  @Put('admins/:id/courses')
  @ApiOperation({ summary: '把已有课程分配给校企业' })
  assignCourses(@Req() req: any, @Param('id') id: string, @Body() body: { courseIds?: number[] }) {
    return this.adminService.assignCourses(Number(id), body?.courseIds || [], req.admin);
  }

  @Perm('admin.account')
  @Get('admins/permissions')
  @ApiOperation({ summary: '可分配权限' })
  adminPermissions() {
    return this.adminService.permissionOptions();
  }

  @Perm('admin.account')
  @Post('admins')
  @ApiOperation({ summary: '创建管理员' })
  createAdmin(@Req() req: any, @Body() body: any) {
    return this.adminService.saveAdmin(req.admin, body);
  }

  @Perm('admin.account')
  @Put('admins/:id')
  @ApiOperation({ summary: '修改管理员权限' })
  updateAdmin(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.adminService.saveAdmin(req.admin, body, Number(id));
  }

  @Perm('admin.settings')
  @Get('settings/sms')
  @ApiOperation({ summary: '读取阿里云短信配置' })
  getSmsSettings() {
    return this.adminService.getSmsConfig();
  }

  @Perm('admin.settings')
  @Get('settings/sms/balance')
  @ApiOperation({ summary: '阿里云短信剩余量（资源包 + 账户余额）' })
  getSmsBalance(@Query('force') force?: string) {
    return this.adminService.getSmsBalance(force === '1' || force === 'true');
  }

  @Perm('admin.settings')
  @Put('settings/sms')
  @ApiOperation({ summary: '保存阿里云短信配置' })
  saveSmsSettingsPut(@Body() body: any) {
    return this.adminService.saveSmsConfig(body || {});
  }

  @Perm('admin.settings')
  @Post('settings/sms')
  @ApiOperation({ summary: '保存阿里云短信配置' })
  saveSmsSettingsPost(@Body() body: any) {
    return this.adminService.saveSmsConfig(body || {});
  }

  @Perm('admin.settings')
  @Get('settings/wx')
  @ApiOperation({ summary: '读取小程序配置' })
  getWxSettings() {
    return this.adminService.getWxConfig();
  }

  @Perm('admin.settings')
  @Put('settings/wx')
  @ApiOperation({ summary: '保存小程序配置' })
  saveWxSettingsPut(@Body() body: { appId?: string; secret?: string }) {
    return this.adminService.saveWxConfig(body || {});
  }

  @Perm('admin.settings')
  @Post('settings/wx')
  @ApiOperation({ summary: '保存小程序配置' })
  saveWxSettingsPost(@Body() body: { appId?: string; secret?: string }) {
    return this.adminService.saveWxConfig(body || {});
  }

  @Perm('admin.settings')
  @Get('settings/amap')
  @ApiOperation({ summary: '读取高德密钥' })
  getAmapSettings() {
    return this.adminService.getAmapConfig();
  }

  @Perm('admin.settings')
  @Put('settings/amap')
  @ApiOperation({ summary: '保存高德密钥' })
  saveAmapSettingsPut(@Body() body: { key?: string; security?: string }) {
    return this.adminService.saveAmapConfig(body || {});
  }

  @Perm('admin.settings')
  @Post('settings/amap')
  @ApiOperation({ summary: '保存高德密钥' })
  saveAmapSettingsPost(@Body() body: { key?: string; security?: string }) {
    return this.adminService.saveAmapConfig(body || {});
  }

  @Perm('admin.settings')
  @Get('settings/agreement')
  @ApiOperation({ summary: '读取用户协议' })
  getAgreementSettings() {
    return this.adminService.getAgreementConfig();
  }

  @Perm('admin.settings')
  @Put('settings/agreement')
  @ApiOperation({ summary: '保存用户协议' })
  saveAgreementSettingsPut(@Body() body: { title?: string; content?: string }) {
    return this.adminService.saveAgreementConfig(body || {});
  }

  @Perm('admin.settings')
  @Post('settings/agreement')
  @ApiOperation({ summary: '保存用户协议' })
  saveAgreementSettingsPost(@Body() body: { title?: string; content?: string }) {
    return this.adminService.saveAgreementConfig(body || {});
  }

  @Perm('admin.settings')
  @Get('settings/contract')
  @ApiOperation({ summary: '读取教师服务合同' })
  getContractSettings() {
    return this.adminService.getContractConfig();
  }

  @Perm('admin.settings')
  @Put('settings/contract')
  @ApiOperation({ summary: '保存教师服务合同' })
  saveContractSettingsPut(@Body() body: { title?: string; content?: string }) {
    return this.adminService.saveContractConfig(body || {});
  }

  @Perm('admin.settings')
  @Post('settings/contract')
  @ApiOperation({ summary: '保存教师服务合同' })
  saveContractSettingsPost(@Body() body: { title?: string; content?: string }) {
    return this.adminService.saveContractConfig(body || {});
  }

  @Perm('admin.settings')
  @Get('settings/party-a')
  @ApiOperation({ summary: '读取合同甲方对公信息' })
  getPartyASettings() {
    return this.adminService.getPartyAConfig();
  }

  @Perm('admin.settings')
  @Put('settings/party-a')
  @ApiOperation({ summary: '保存合同甲方对公信息' })
  savePartyASettingsPut(@Body() body: Record<string, string>) {
    return this.adminService.savePartyAConfig(body || {});
  }

  @Perm('admin.settings')
  @Post('settings/party-a')
  @ApiOperation({ summary: '保存合同甲方对公信息' })
  savePartyASettingsPost(@Body() body: Record<string, string>) {
    return this.adminService.savePartyAConfig(body || {});
  }

  @AdminAccess({ perms: 'any', school: true })
  @Get('system/version')
  @ApiOperation({ summary: '当前系统版本' })
  systemVersion() {
    return this.adminService.getSystemInfo();
  }

  @AdminAccess({ perms: 'any' })
  @Get('system/updates')
  @ApiOperation({ summary: '可更新版本列表' })
  systemUpdates(@Query('force') force?: string) {
    return this.adminService.getSystemUpdates(force === '1' || force === 'true');
  }

  @AdminAccess({ perms: 'any' })
  @Get('system/update-progress')
  @ApiOperation({ summary: '更新进度' })
  updateProgress() {
    return this.adminService.getUpdateProgress();
  }

  @AdminAccess({ superOnly: true })
  @Post('system/apply-update')
  @ApiOperation({ summary: '下载更新包并自动重启' })
  applyUpdate(@Body() body: { tag?: string; background?: boolean }) {
    if (body?.background) return this.adminService.startUpdate(body?.tag);
    return this.adminService.applyUpdate(body?.tag);
  }

  @AdminAccess({ superOnly: true })
  @Get('system/database')
  @ApiOperation({ summary: '数据库状态' })
  databaseInfo() {
    return this.adminService.getDatabaseInfo();
  }

  @AdminAccess({ superOnly: true })
  @Get('system/database/export')
  @ApiOperation({ summary: '导出数据库' })
  exportDatabase() {
    return this.adminService.exportDatabase();
  }

  @AdminAccess({ superOnly: true })
  @Post('system/database/import')
  @ApiOperation({ summary: '导入数据库' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 200 * 1024 * 1024 } }))
  importDatabase(@UploadedFile() file: { buffer?: Buffer; originalname?: string; size?: number }) {
    return this.adminService.importDatabase(file);
  }

  @AdminAccess({ superOnly: true })
  @Post('system/database/init-snapshot')
  @ApiOperation({ summary: '把当前库写成初始快照' })
  saveInitSnapshot() {
    return this.adminService.saveInitSnapshot();
  }

  @Perm('admin.account')
  @Delete('admins/:id')
  @ApiOperation({ summary: '删除管理员' })
  deleteAdmin(@Req() req: any, @Param('id') id: string) {
    return this.adminService.deleteAdmin(req.admin, Number(id));
  }

  @AdminAccess({ perms: 'any' })
  @Get('search')
  @ApiOperation({ summary: '搜索课程、用户、订单' })
  search(@Req() req: any, @Query('keyword') keyword = '') {
    return this.adminService.search(keyword, req.admin);
  }

  @Perm('people.user')
  @Get('users')
  @ApiOperation({ summary: '用户列表' })
  getUsers(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.adminService.getUsers(Number(page), Number(pageSize), keyword);
  }

  @Perm('course.list')
  @Get('courses/school-accounts')
  @ApiOperation({ summary: '可选校企业账号' })
  schoolAccounts() {
    return this.adminService.schoolAccounts();
  }

  @SchoolPerm('course.list', 'course.assign', 'course.term', 'course.category', 'org.list')
  @Get('courses')
  @ApiOperation({ summary: '课程列表' })
  getCourses(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('isFree') isFree?: string,
    @Query('categoryId') categoryId?: string,
    @Query('semesterScope') semesterScope?: string,
    @Query('semesterId') semesterId?: string,
  ) {
    return this.adminService.getCourses(
      Number(page),
      Number(pageSize),
      keyword,
      status,
      isFree,
      categoryId,
      req.admin,
      semesterScope,
      semesterId ? Number(semesterId) : undefined,
    );
  }

  @SchoolPerm('course.list')
  @Get('courses/:id/plan')
  @ApiOperation({ summary: '一门课的排课日历' })
  coursePlan(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.coursePlan(Number(id), req.admin);
  }

  @SchoolPerm('course.list')
  @Post('courses/:id/sessions')
  @ApiOperation({ summary: '为一门课加一节' })
  createCourseSession(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.scheduleService.createCourseSession(Number(id), body || {}, req.admin);
  }

  @SchoolPerm('course.list')
  @Post('courses/:id/generate')
  @ApiOperation({ summary: '按每周时间为一门课生成课次' })
  generateCourse(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.scheduleService.generate(Number(body?.semesterId), [Number(id)], body?.slots, Number(body?.count), req.admin);
  }

  @SchoolPerm('course.list')
  @Post('courses/:id/continue')
  @ApiOperation({ summary: '课程延续到新学期（可换老师）' })
  continueCourse(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.scheduleService.continueCourse(Number(id), body || {}, req.admin);
  }

  @SchoolPerm('course.list')
  @Put('courses/:id/sessions/:sessionId')
  @ApiOperation({ summary: '调整一门课的某一节' })
  updateCourseSession(@Req() req: any, @Param('id') id: string, @Param('sessionId') sessionId: string, @Body() body: any) {
    return this.scheduleService.updateCourseSession(Number(id), Number(sessionId), body || {}, req.admin);
  }

  @SchoolPerm('course.list')
  @Delete('courses/:id/sessions/:sessionId')
  @ApiOperation({ summary: '删除一门课的某一节' })
  deleteCourseSession(@Req() req: any, @Param('id') id: string, @Param('sessionId') sessionId: string) {
    return this.scheduleService.deleteCourseSession(Number(id), Number(sessionId), req.admin);
  }

  @SchoolPerm('course.list')
  @Get('courses/:id')
  @ApiOperation({ summary: '课程详情' })
  getCourse(@Req() req: any, @Param('id') id: string) {
    return this.adminService.getCourse(Number(id), req.admin);
  }

  @SchoolPerm('course.list')
  @Post('courses')
  @ApiOperation({ summary: '新增课程' })
  createCourse(@Req() req: any, @Body() body: any) {
    return this.adminService.createCourse(body, req.admin);
  }

  @SchoolPerm('course.list')
  @Put('courses/:id')
  @ApiOperation({ summary: '修改课程' })
  async updateCourse(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const before = (await this.adminService.assertCourseAccess(Number(id), req.admin)).teacherId;
    const saved = await this.adminService.updateCourse(Number(id), body, req.admin);
    return { ...saved, teacherChange: await this.applyTeacherChange(saved, before, body?.teacherFrom) };
  }

  @SchoolPerm('course.list')
  @Put('courses/:id/teacher')
  @ApiOperation({ summary: '更换课程老师，并按生效日分配已上课次' })
  async setCourseTeacher(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const { before, saved } = await this.adminService.setCourseTeacher(Number(id), body?.teacherId, req.admin);
    return { ...saved, teacherChange: await this.applyTeacherChange(saved, before, body?.teacherFrom) };
  }

  private applyTeacherChange(saved: { id: number; teacherId: number | null }, before: number | null, from?: string) {
    if (!from || (before || null) === (saved.teacherId || null)) return null;
    return this.financeService.applyTeacherChange(saved.id, saved.teacherId, String(from), before);
  }

  @SchoolPerm('course.list')
  @Get('courses/:id/teacher-change')
  @ApiOperation({ summary: '换老师预览：生效日之后已上完的课次' })
  async teacherChangePreview(@Req() req: any, @Param('id') id: string, @Query('from') from: string) {
    await this.adminService.assertCourseAccess(Number(id), req.admin);
    return this.financeService.teacherChangePreview(Number(id), String(from || ''));
  }

  @SchoolPerm('course.list')
  @Delete('courses/:id')
  @ApiOperation({ summary: '删除课程' })
  deleteCourse(@Req() req: any, @Param('id') id: string) {
    return this.adminService.deleteCourse(Number(id), req.admin);
  }

  @SchoolPerm('course.list')
  @Post('courses/batch-delete')
  @ApiOperation({ summary: '批量删除课程' })
  deleteCourses(@Req() req: any, @Body() body: { ids?: number[] }) {
    return this.adminService.deleteCourses(body?.ids || [], req.admin);
  }

  @SchoolPerm('course.list', 'course.category')
  @Post('courses/batch-update')
  @ApiOperation({ summary: '批量更新课程字段（年级/分类/状态）' })
  patchCourses(@Req() req: any, @Body() body: any) {
    return this.adminService.patchCourses(body?.ids || [], body || {}, req.admin);
  }

  @SchoolPerm('course.list')
  @Post('courses/batch-generate')
  @ApiOperation({ summary: '按年级批量生成课程' })
  generateCourses(@Req() req: any, @Body() body: any) {
    return this.adminService.generateCourses(body || {}, req.admin);
  }

  @SchoolPerm('course.list')
  @Post('courses/batch-copy')
  @ApiOperation({ summary: '批量复制课程' })
  copyCourses(@Req() req: any, @Body() body: { ids?: number[] }) {
    return this.adminService.copyCourses(body?.ids || [], req.admin);
  }

  @SchoolPerm('course.list', 'course.term', 'course.assign')
  @Get('teachers')
  @ApiOperation({ summary: '可选老师' })
  getTeachers() {
    return this.adminService.getTeachers();
  }

  @SchoolPerm('course.category')
  @Post('categories')
  @ApiOperation({ summary: '新增分类' })
  createCategory(@Req() req: any, @Body() body: any) {
    return this.adminService.saveCategory(body, undefined, req.admin);
  }

  @SchoolPerm('course.category')
  @Put('categories/:id')
  @ApiOperation({ summary: '修改分类' })
  updateCategory(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.adminService.saveCategory(body, Number(id), req.admin);
  }

  @SchoolPerm('course.category')
  @Delete('categories/:id')
  @ApiOperation({ summary: '删除分类' })
  deleteCategory(@Req() req: any, @Param('id') id: string) {
    return this.adminService.deleteCategory(Number(id), req.admin);
  }

  @SchoolPerm('course.category')
  @Post('categories/batch-delete')
  @ApiOperation({ summary: '批量删除分类' })
  deleteCategories(@Req() req: any, @Body() body: { ids?: number[] }) {
    return this.adminService.deleteCategories(body?.ids || [], req.admin);
  }

  @Perm('course.school')
  @Get('schools/amap-config')
  @ApiOperation({ summary: '学校地图用的高德配置' })
  amapConfig() {
    return this.adminService.getAmapRuntimeConfig();
  }

  @SchoolPerm('course.list', 'course.school')
  @Get('schools')
  @ApiOperation({ summary: '学校列表' })
  listSchools() {
    return this.adminService.listSchools();
  }

  @Perm('course.school')
  @Post('schools')
  @ApiOperation({ summary: '创建学校' })
  createSchool(@Body() body: any) {
    return this.adminService.saveSchool(body);
  }

  @Perm('course.school')
  @Put('schools/:id')
  @ApiOperation({ summary: '更新学校' })
  updateSchool(@Param('id') id: string, @Body() body: any) {
    return this.adminService.saveSchool(body, Number(id));
  }

  @Perm('course.school')
  @Delete('schools/:id')
  @ApiOperation({ summary: '删除学校' })
  removeSchool(@Param('id') id: string) {
    return this.adminService.deleteSchool(Number(id));
  }

  @SchoolPerm('course.list', 'course.category', 'course.term')
  @Get('categories')
  @ApiOperation({ summary: '分类列表' })
  getCategories(@Req() req: any) {
    return this.adminService.getCategories(req.admin);
  }

  @Perm('trade.order')
  @Get('orders')
  @ApiOperation({ summary: '订单列表' })
  getOrders(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getOrders(Number(page), Number(pageSize), keyword, status);
  }

  @Perm('trade.comment')
  @Get('comments')
  @ApiOperation({ summary: '评价列表' })
  getComments(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.adminService.getComments(Number(page), Number(pageSize), keyword);
  }

  @SchoolPerm('course.list', 'course.term')
  @Get('semesters')
  @ApiOperation({ summary: '学期列表' })
  getSemesters() {
    return this.scheduleService.listSemesters();
  }

  @SchoolPerm('course.term')
  @Get('semesters/records')
  @ApiOperation({ summary: '按年份和学期统计留存记录' })
  semesterRecords() {
    return this.scheduleService.semesterRecords();
  }

  @SchoolPerm('course.term')
  @Post('semesters')
  @ApiOperation({ summary: '新增学期' })
  createSemester(@Req() req: any, @Body() body: any) {
    return this.scheduleService.saveSemester(body, undefined, req.admin);
  }

  @SchoolPerm('course.term')
  @Put('semesters/:id')
  @ApiOperation({ summary: '修改学期' })
  updateSemester(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.scheduleService.saveSemester(body, Number(id), req.admin);
  }

  @SchoolPerm('course.term')
  @Delete('semesters/:id')
  @ApiOperation({ summary: '删除学期' })
  deleteSemester(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.deleteSemester(Number(id), req.admin);
  }

  @SchoolPerm('course.term')
  @Post('semesters/:id/generate')
  @ApiOperation({ summary: '按每周时间循环生成课表' })
  generateSemester(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { courseIds?: number[]; slots?: { weekday: number; startTime: string; endTime?: string }[]; count?: number },
  ) {
    return this.scheduleService.generate(Number(id), body?.courseIds, body?.slots, body?.count, req.admin);
  }

  @SchoolPerm('course.term')
  @Get('holidays')
  @ApiOperation({ summary: '节假日' })
  getHolidays(@Query('semesterId') semesterId: string) {
    return this.scheduleService.listHolidays(Number(semesterId));
  }

  @SchoolPerm('course.term')
  @Post('holidays')
  @ApiOperation({ summary: '新增节假日并修正课表' })
  createHoliday(@Req() req: any, @Body() body: any) {
    return this.scheduleService.saveHoliday(body, req.admin);
  }

  @SchoolPerm('course.term')
  @Delete('holidays/:id')
  @ApiOperation({ summary: '删除节假日并修正课表' })
  deleteHoliday(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.deleteHoliday(Number(id), req.admin);
  }

  @SchoolPerm('course.list', 'course.term')
  @Get('sessions/export')
  @ApiOperation({ summary: '按月导出课表 Excel' })
  exportSessions(@Query('month') month: string, @Query('courseIds') courseIds: string, @Req() req: any) {
    return this.scheduleService.exportMonth(month, req.admin, courseIds);
  }

  @SchoolPerm('course.list', 'course.term')
  @Get('sessions')
  @ApiOperation({ summary: '已生成的上课日' })
  getSessions(
    @Query('semesterId') semesterId?: string,
    @Query('courseId') courseId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('month') month?: string,
    @Req() req?: any,
  ) {
    return this.scheduleService.listSessions(
      semesterId ? Number(semesterId) : undefined,
      courseId ? Number(courseId) : undefined,
      Number(page),
      Number(pageSize),
      month,
      req?.admin,
    );
  }

  @SchoolPerm('course.term')
  @Put('sessions/:id')
  @ApiOperation({ summary: '调整单节课' })
  updateSession(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.scheduleService.updateSession(Number(id), body, req.admin);
  }

  @SchoolPerm('course.term')
  @Delete('sessions/:id')
  @ApiOperation({ summary: '删除单节课' })
  deleteSession(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.deleteSession(Number(id), req.admin);
  }

  @Perm('people.cert')
  @Get('ocr-reviews')
  @ApiOperation({ summary: '身份证 OCR 人工处理列表' })
  listOcrReviews() {
    return this.contractFlow.listOcrReviews();
  }

  @Perm('people.cert')
  @Post('ocr-reviews/:userId/confirm')
  @ApiOperation({ summary: '人工确认身份证信息' })
  confirmOcr(@Req() req: any, @Param('userId') userId: string, @Body() body: any) {
    return this.contractFlow.adminConfirmIdentity(Number(userId), body || {}, {
      id: req.admin?.id,
      name: req.admin?.name || req.admin?.username,
    });
  }
}
