import { Module } from '@nestjs/common';
import { AdminAuthController, AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ScheduleModule } from '../schedule/schedule.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [ScheduleModule, SmsModule],
  controllers: [AdminAuthController, AdminController],
  providers: [AdminService],
})
export class AdminModule {}
