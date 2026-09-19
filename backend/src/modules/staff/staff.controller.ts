import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
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

  @Post('faculty/:id/grants')
  grant(@Param('id') id: string, @Body() body: any) {
    return this.staff.saveGrant(Number(id), body);
  }

  @Get('certs')
  certs() {
    return this.staff.certs();
  }

  @Post('certs/:userId/review')
  review(@Param('userId') userId: string, @Body() body: { action: string; reason?: string }) {
    return this.staff.review(Number(userId), body.action, body.reason);
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
}
