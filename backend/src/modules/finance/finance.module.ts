import { Module, forwardRef } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { BankTxnService } from './bank.service';
import { FinanceAdminController } from './finance.controller';
import { StaffModule } from '../staff/staff.module';

@Module({
  imports: [forwardRef(() => StaffModule)],
  controllers: [FinanceAdminController],
  providers: [FinanceService, BankTxnService],
  exports: [FinanceService],
})
export class FinanceModule {}
