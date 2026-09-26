import { Module } from '@nestjs/common';
import { AdminAuthController, AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ScheduleModule } from '../schedule/schedule.module';
import { SmsModule } from '../sms/sms.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [ScheduleModule, SmsModule, UserModule],
  controllers: [AdminAuthController, AdminController],
  providers: [AdminService],
})
export class AdminModule {}
