import { Module, forwardRef } from '@nestjs/common';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { StaffModule } from '../staff/staff.module';
import { ScheduleModule } from '../schedule/schedule.module';

@Module({
  imports: [StaffModule, forwardRef(() => ScheduleModule)],
  controllers: [CourseController],
  providers: [CourseService],
  exports: [CourseService],
})
export class CourseModule {}
