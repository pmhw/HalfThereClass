import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceAdminController } from './finance.controller';

@Module({
  controllers: [FinanceAdminController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
