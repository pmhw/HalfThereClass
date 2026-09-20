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
  captcha() {
    return this.adminService.createCaptcha();
  }

  @Post('captcha/check')
  @ApiOperation({ summary: '核对滑块位置' })
  checkCaptcha(@Body() dto: CaptchaCheckDto) {
    return this.adminService.checkCaptcha(dto.captchaToken, dto.offset);
  }

  @Post('login')
  @ApiOperation({ summary: '管理员登录' })
  login(@Body() dto: AdminLoginDto) {
    return this.adminService.login(dto.username, dto.password, dto.captchaToken, dto.offset);
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

  @Get('courses')
  @ApiOperation({ summary: '课程列表' })
  getCourses(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('isFree') isFree?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.adminService.getCourses(Number(page), Number(pageSize), keyword, status, isFree, categoryId);
  }

  @Get('courses/:id/plan')
  @ApiOperation({ summary: '一门课的排课日历' })
  coursePlan(@Param('id') id: string) {
    return this.scheduleService.coursePlan(Number(id));
  }

  @Post('courses/:id/sessions')
  @ApiOperation({ summary: '为一门课加一节' })
  createCourseSession(@Param('id') id: string, @Body() body: any) {
    return this.scheduleService.createCourseSession(Number(id), body || {});
  }

  @Post('courses/:id/generate')
  @ApiOperation({ summary: '按每周时间为一门课生成课次' })
  generateCourse(@Param('id') id: string, @Body() body: any) {
    return this.scheduleService.generate(Number(body?.semesterId), [Number(id)], body?.slots, Number(body?.count));
  }

  @Put('courses/:id/sessions/:sessionId')
  @ApiOperation({ summary: '调整一门课的某一节' })
  updateCourseSession(@Param('id') id: string, @Param('sessionId') sessionId: string, @Body() body: any) {
    return this.scheduleService.updateCourseSession(Number(id), Number(sessionId), body || {});
  }

  @Delete('courses/:id/sessions/:sessionId')
  @ApiOperation({ summary: '删除一门课的某一节' })
  deleteCourseSession(@Param('id') id: string, @Param('sessionId') sessionId: string) {
    return this.scheduleService.deleteCourseSession(Number(id), Number(sessionId));
  }

  @Get('courses/:id')
  @ApiOperation({ summary: '课程详情' })
  getCourse(@Param('id') id: string) {
    return this.adminService.getCourse(Number(id));
  }

  @Post('courses')
  @ApiOperation({ summary: '新增课程' })
  createCourse(@Body() body: any) {
    return this.adminService.createCourse(body);
  }

  @Put('courses/:id')
  @ApiOperation({ summary: '修改课程' })
  updateCourse(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateCourse(Number(id), body);
  }

  @Delete('courses/:id')
  @ApiOperation({ summary: '删除课程' })
  deleteCourse(@Param('id') id: string) {
    return this.adminService.deleteCourse(Number(id));
  }

  @Post('courses/batch-delete')
  @ApiOperation({ summary: '批量删除课程' })
  deleteCourses(@Body() body: { ids?: number[] }) {
    return this.adminService.deleteCourses(body?.ids || []);
  }

  @Get('teachers')
  @ApiOperation({ summary: '可选老师' })
  getTeachers() {
    return this.adminService.getTeachers();
  }

  @Post('categories')
  @ApiOperation({ summary: '新增分类' })
  createCategory(@Body() body: any) {
    return this.adminService.saveCategory(body);
  }

  @Put('categories/:id')
  @ApiOperation({ summary: '修改分类' })
  updateCategory(@Param('id') id: string, @Body() body: any) {
    return this.adminService.saveCategory(body, Number(id));
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: '删除分类' })
  deleteCategory(@Param('id') id: string) {
    return this.adminService.deleteCategory(Number(id));
  }

  @Post('categories/batch-delete')
  @ApiOperation({ summary: '批量删除分类' })
  deleteCategories(@Body() body: { ids?: number[] }) {
    return this.adminService.deleteCategories(body?.ids || []);
  }

  @Get('schools/amap-config')
  @ApiOperation({ summary: '学校地图用的高德配置' })
  amapConfig() {
    return this.adminService.getAmapConfig();
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
  getCategories() {
    return this.adminService.getCategories();
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
  createSemester(@Body() body: any) {
    return this.scheduleService.saveSemester(body);
  }

  @Put('semesters/:id')
  @ApiOperation({ summary: '修改学期' })
  updateSemester(@Param('id') id: string, @Body() body: any) {
    return this.scheduleService.saveSemester(body, Number(id));
  }

  @Delete('semesters/:id')
  @ApiOperation({ summary: '删除学期' })
  deleteSemester(@Param('id') id: string) {
    return this.scheduleService.deleteSemester(Number(id));
  }

  @Post('semesters/:id/generate')
  @ApiOperation({ summary: '按每周时间循环生成课表' })
  generateSemester(
    @Param('id') id: string,
    @Body() body: { courseIds?: number[]; slots?: { weekday: number; startTime: string; endTime?: string }[]; count?: number },
  ) {
    return this.scheduleService.generate(Number(id), body?.courseIds, body?.slots, body?.count);
  }

  @Get('holidays')
  @ApiOperation({ summary: '节假日' })
  getHolidays(@Query('semesterId') semesterId: string) {
    return this.scheduleService.listHolidays(Number(semesterId));
  }

  @Post('holidays')
  @ApiOperation({ summary: '新增节假日并修正课表' })
  createHoliday(@Body() body: any) {
    return this.scheduleService.saveHoliday(body);
  }

  @Delete('holidays/:id')
  @ApiOperation({ summary: '删除节假日并修正课表' })
  deleteHoliday(@Param('id') id: string) {
    return this.scheduleService.deleteHoliday(Number(id));
  }

  @Get('sessions')
  @ApiOperation({ summary: '已生成的上课日' })
  getSessions(
    @Query('semesterId') semesterId?: string,
    @Query('courseId') courseId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('month') month?: string,
  ) {
    return this.scheduleService.listSessions(
      semesterId ? Number(semesterId) : undefined,
      courseId ? Number(courseId) : undefined,
      Number(page),
      Number(pageSize),
      month,
    );
  }

  @Put('sessions/:id')
  @ApiOperation({ summary: '调整单节课' })
  updateSession(@Param('id') id: string, @Body() body: any) {
    return this.scheduleService.updateSession(Number(id), body);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: '删除单节课' })
  deleteSession(@Param('id') id: string) {
    return this.scheduleService.deleteSession(Number(id));
  }
}
