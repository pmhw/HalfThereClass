import { Module } from '@nestjs/common';
import { DiyPosterAdminController, DiyPosterPublicController } from './diy-poster.controller';
import { DiyPosterService } from './diy-poster.service';

@Module({
  controllers: [DiyPosterAdminController, DiyPosterPublicController],
  providers: [DiyPosterService],
})
export class DiyPosterModule {}
