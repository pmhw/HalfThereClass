import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { IdOcrService } from './id-ocr.service';
import { ContractFlowService } from './contract-flow.service';

@Module({
  controllers: [UserController],
  providers: [UserService, IdOcrService, ContractFlowService],
  exports: [UserService, ContractFlowService],
})
export class UserModule {}
