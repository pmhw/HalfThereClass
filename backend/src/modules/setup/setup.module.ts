import { Module } from '@nestjs/common';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
import { SmsModule } from '../sms/sms.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [SmsModule, FinanceModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
