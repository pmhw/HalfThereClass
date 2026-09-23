import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminLoginDto, CaptchaCheckDto } from './dto/admin-login.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AdminPermissionGuard } from '@/common/guards/admin-permission.guard';
import { ScheduleService } from '../schedule/schedule.service';

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
  ) {}

  @Get('session')
  @ApiOperation({ summary: '检查当前账号是否被冻结或停用' })
  session() {
    return { ok: true };
  }

  @Get('dashboard')
  @ApiOperation({ summary: '数据概览' })
  getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('admins')
  @ApiOperation({ summary: '管理员列表' })
  getAdmins(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.adminService.listAdmins(Number(page), Number(pageSize), keyword);
  }

  @Get('admins/course-options')
  @ApiOperation({ summary: '可分配给校企业的课程' })
  courseOptions() {
    return this.adminService.courseOptions();
  }

  @Put('admins/:id/courses')
  @ApiOperation({ summary: '把已有课程分配给校企业' })
  assignCourses(@Param('id') id: string, @Body() body: { courseIds?: number[] }) {
    return this.adminService.assignCourses(Number(id), body?.courseIds || []);
  }

  @Get('admins/permissions')
  @ApiOperation({ summary: '可分配权限' })
  adminPermissions() {
    return this.adminService.permissionOptions();
  }

  @Post('admins')
  @ApiOperation({ summary: '创建管理员' })
  createAdmin(@Req() req: any, @Body() body: any) {
    return this.adminService.saveAdmin(req.admin, body);
  }

  @Put('admins/:id')
  @ApiOperation({ summary: '修改管理员权限' })
  updateAdmin(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.adminService.saveAdmin(req.admin, body, Number(id));
  }

  @Get('settings/sms')
  @ApiOperation({ summary: '读取阿里云短信配置' })
  getSmsSettings() {
    return this.adminService.getSmsConfig();
  }

  @Put('settings/sms')
  @ApiOperation({ summary: '保存阿里云短信配置' })
  saveSmsSettings(@Body() body: any) {
    return this.adminService.saveSmsConfig(body || {});
  }

  @Get('settings/wx')
  @ApiOperation({ summary: '读取小程序配置' })
  getWxSettings() {
    return this.adminService.getWxConfig();
  }

  @Put('settings/wx')
  @ApiOperation({ summary: '保存小程序配置' })
  saveWxSettings(@Body() body: { appId?: string; secret?: string }) {
    return this.adminService.saveWxConfig(body || {});
  }

  @Get('settings/amap')
  @ApiOperation({ summary: '读取高德密钥' })
  getAmapSettings() {
    return this.adminService.getAmapConfig();
  }

  @Put('settings/amap')
  @ApiOperation({ summary: '保存高德密钥' })
  saveAmapSettings(@Body() body: { key?: string; security?: string }) {
    return this.adminService.saveAmapConfig(body || {});
  }

  @Get('settings/agreement')
  @ApiOperation({ summary: '读取用户协议' })
  getAgreementSettings() {
    return this.adminService.getAgreementConfig();
  }

  @Put('settings/agreement')
  @ApiOperation({ summary: '保存用户协议' })
  saveAgreementSettings(@Body() body: { title?: string; content?: string }) {
    return this.adminService.saveAgreementConfig(body || {});
  }

  @Get('settings/contract')
  @ApiOperation({ summary: '读取教师服务合同' })
  getContractSettings() {
    return this.adminService.getContractConfig();
  }

  @Put('settings/contract')
  @ApiOperation({ summary: '保存教师服务合同' })
  saveContractSettings(@Body() body: { title?: string; content?: string }) {
    return this.adminService.saveContractConfig(body || {});
  }

  @Get('system/version')
  @ApiOperation({ summary: '当前系统版本' })
  systemVersion() {
    return this.adminService.getSystemInfo();
  }

  @Get('system/updates')
  @ApiOperation({ summary: '可更新版本列表' })
  systemUpdates() {
    return this.adminService.getSystemUpdates();
  }

  @Get('system/update-progress')
  @ApiOperation({ summary: '更新进度' })
  updateProgress() {
    return this.adminService.getUpdateProgress();
  }

  @Post('system/apply-update')
  @ApiOperation({ summary: '下载更新包并自动重启' })
  applyUpdate(@Body() body: { tag?: string }) {
    return this.adminService.applyUpdate(body?.tag);
  }

  @Get('system/database')
  @ApiOperation({ summary: '数据库状态' })
  databaseInfo() {
    return this.adminService.getDatabaseInfo();
  }

  @Get('system/database/export')
  @ApiOperation({ summary: '导出数据库' })
  exportDatabase() {
    return this.adminService.exportDatabase();
  }

  @Post('system/database/import')
  @ApiOperation({ summary: '导入数据库' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 200 * 1024 * 1024 } }))
  importDatabase(@UploadedFile() file: { buffer?: Buffer; originalname?: string; size?: number }) {
    return this.adminService.importDatabase(file);
  }

  @Post('system/database/init-snapshot')
  @ApiOperation({ summary: '把当前库写成初始快照' })
  saveInitSnapshot() {
    return this.adminService.saveInitSnapshot();
  }

  @Delete('admins/:id')
  @ApiOperation({ summary: '删除管理员' })
  deleteAdmin(@Req() req: any, @Param('id') id: string) {
    return this.adminService.deleteAdmin(req.admin, Number(id));
  }

  @Get('search')
  @ApiOperation({ summary: '搜索课程、用户、订单' })
  search(@Query('keyword') keyword = '') {
    return this.adminService.search(keyword);
  }

  @Get('users')
  @ApiOperation({ summary: '用户列表' })
  getUsers(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.adminService.getUsers(Number(page), Number(pageSize), keyword);
  }

  @Get('courses/school-accounts')
  @ApiOperation({ summary: '可选校企业账号' })
  schoolAccounts() {
    return this.adminService.schoolAccounts();
  }

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
  ) {
    return this.adminService.getCourses(Number(page), Number(pageSize), keyword, status, isFree, categoryId, req.admin);
  }

  @Get('courses/:id/plan')
  @ApiOperation({ summary: '一门课的排课日历' })
  coursePlan(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.coursePlan(Number(id), req.admin);
  }

  @Post('courses/:id/sessions')
  @ApiOperation({ summary: '为一门课加一节' })
  createCourseSession(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.scheduleService.createCourseSession(Number(id), body || {}, req.admin);
  }

  @Post('courses/:id/generate')
  @ApiOperation({ summary: '按每周时间为一门课生成课次' })
  generateCourse(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.scheduleService.generate(Number(body?.semesterId), [Number(id)], body?.slots, Number(body?.count), req.admin);
  }

  @Put('courses/:id/sessions/:sessionId')
  @ApiOperation({ summary: '调整一门课的某一节' })
  updateCourseSession(@Req() req: any, @Param('id') id: string, @Param('sessionId') sessionId: string, @Body() body: any) {
    return this.scheduleService.updateCourseSession(Number(id), Number(sessionId), body || {}, req.admin);
  }

  @Delete('courses/:id/sessions/:sessionId')
  @ApiOperation({ summary: '删除一门课的某一节' })
  deleteCourseSession(@Req() req: any, @Param('id') id: string, @Param('sessionId') sessionId: string) {
    return this.scheduleService.deleteCourseSession(Number(id), Number(sessionId), req.admin);
  }

  @Get('courses/:id')
  @ApiOperation({ summary: '课程详情' })
  getCourse(@Req() req: any, @Param('id') id: string) {
    return this.adminService.getCourse(Number(id), req.admin);
  }

  @Post('courses')
  @ApiOperation({ summary: '新增课程' })
  createCourse(@Req() req: any, @Body() body: any) {
    return this.adminService.createCourse(body, req.admin);
  }

  @Put('courses/:id')
  @ApiOperation({ summary: '修改课程' })
  updateCourse(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.adminService.updateCourse(Number(id), body, req.admin);
  }

  @Delete('courses/:id')
  @ApiOperation({ summary: '删除课程' })
  deleteCourse(@Req() req: any, @Param('id') id: string) {
    return this.adminService.deleteCourse(Number(id), req.admin);
  }

  @Post('courses/batch-delete')
  @ApiOperation({ summary: '批量删除课程' })
  deleteCourses(@Req() req: any, @Body() body: { ids?: number[] }) {
    return this.adminService.deleteCourses(body?.ids || [], req.admin);
  }

  @Get('teachers')
  @ApiOperation({ summary: '可选老师' })
  getTeachers() {
    return this.adminService.getTeachers();
  }

  @Post('categories')
  @ApiOperation({ summary: '新增分类' })
  createCategory(@Req() req: any, @Body() body: any) {
    return this.adminService.saveCategory(body, undefined, req.admin);
  }

  @Put('categories/:id')
  @ApiOperation({ summary: '修改分类' })
  updateCategory(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.adminService.saveCategory(body, Number(id), req.admin);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: '删除分类' })
  deleteCategory(@Req() req: any, @Param('id') id: string) {
    return this.adminService.deleteCategory(Number(id), req.admin);
  }

  @Post('categories/batch-delete')
  @ApiOperation({ summary: '批量删除分类' })
  deleteCategories(@Req() req: any, @Body() body: { ids?: number[] }) {
    return this.adminService.deleteCategories(body?.ids || [], req.admin);
  }

  @Get('schools/amap-config')
  @ApiOperation({ summary: '学校地图用的高德配置' })
  amapConfig() {
    return this.adminService.getAmapRuntimeConfig();
  }

  @Get('schools')
  @ApiOperation({ summary: '学校列表' })
  listSchools() {
    return this.adminService.listSchools();
  }

  @Post('schools')
  @ApiOperation({ summary: '创建学校' })
  createSchool(@Body() body: any) {
    return this.adminService.saveSchool(body);
  }

  @Put('schools/:id')
  @ApiOperation({ summary: '更新学校' })
  updateSchool(@Param('id') id: string, @Body() body: any) {
    return this.adminService.saveSchool(body, Number(id));
  }

  @Delete('schools/:id')
  @ApiOperation({ summary: '删除学校' })
  removeSchool(@Param('id') id: string) {
    return this.adminService.deleteSchool(Number(id));
  }

  @Get('categories')
  @ApiOperation({ summary: '分类列表' })
  getCategories(@Req() req: any) {
    return this.adminService.getCategories(req.admin);
  }

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

  @Get('comments')
  @ApiOperation({ summary: '评价列表' })
  getComments(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.adminService.getComments(Number(page), Number(pageSize), keyword);
  }

  @Get('semesters')
  @ApiOperation({ summary: '学期列表' })
  getSemesters() {
    return this.scheduleService.listSemesters();
  }

  @Get('semesters/records')
  @ApiOperation({ summary: '按年份和学期统计留存记录' })
  semesterRecords() {
    return this.scheduleService.semesterRecords();
  }

  @Post('semesters')
  @ApiOperation({ summary: '新增学期' })
  createSemester(@Req() req: any, @Body() body: any) {
    return this.scheduleService.saveSemester(body, undefined, req.admin);
  }

  @Put('semesters/:id')
  @ApiOperation({ summary: '修改学期' })
  updateSemester(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.scheduleService.saveSemester(body, Number(id), req.admin);
  }

  @Delete('semesters/:id')
  @ApiOperation({ summary: '删除学期' })
  deleteSemester(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.deleteSemester(Number(id), req.admin);
  }

  @Post('semesters/:id/generate')
  @ApiOperation({ summary: '按每周时间循环生成课表' })
  generateSemester(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { courseIds?: number[]; slots?: { weekday: number; startTime: string; endTime?: string }[]; count?: number },
  ) {
    return this.scheduleService.generate(Number(id), body?.courseIds, body?.slots, body?.count, req.admin);
  }

  @Get('holidays')
  @ApiOperation({ summary: '节假日' })
  getHolidays(@Query('semesterId') semesterId: string) {
    return this.scheduleService.listHolidays(Number(semesterId));
  }

  @Post('holidays')
  @ApiOperation({ summary: '新增节假日并修正课表' })
  createHoliday(@Req() req: any, @Body() body: any) {
    return this.scheduleService.saveHoliday(body, req.admin);
  }

  @Delete('holidays/:id')
  @ApiOperation({ summary: '删除节假日并修正课表' })
  deleteHoliday(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.deleteHoliday(Number(id), req.admin);
  }

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

  @Put('sessions/:id')
  @ApiOperation({ summary: '调整单节课' })
  updateSession(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.scheduleService.updateSession(Number(id), body, req.admin);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: '删除单节课' })
  deleteSession(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.deleteSession(Number(id), req.admin);
  }
}
