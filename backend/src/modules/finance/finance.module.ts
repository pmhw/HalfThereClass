import { Module, forwardRef } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { BankTxnService } from './bank.service';
import { AdvanceService } from './advance.service';
import { InvoiceService } from './invoice.service';
import { PrivateAccountService } from './private-account.service';
import { ReserveService } from './reserve.service';
import { FinanceAdminController } from './finance.controller';
import { StaffModule } from '../staff/staff.module';

@Module({
  imports: [forwardRef(() => StaffModule)],
  controllers: [FinanceAdminController],
  providers: [FinanceService, BankTxnService, AdvanceService, InvoiceService, PrivateAccountService, ReserveService],
  exports: [FinanceService],
})
export class FinanceModule {}
