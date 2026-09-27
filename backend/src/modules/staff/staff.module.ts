import { Module, forwardRef } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffAdminController, TeacherPortalController } from './staff.controller';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [forwardRef(() => FinanceModule)],
  controllers: [StaffAdminController, TeacherPortalController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
