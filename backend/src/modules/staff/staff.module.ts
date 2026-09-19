import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffAdminController, TeacherPortalController } from './staff.controller';

@Module({
  controllers: [StaffAdminController, TeacherPortalController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
