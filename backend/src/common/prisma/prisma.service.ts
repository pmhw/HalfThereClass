import { PrismaClient } from '@prisma/client';
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    // SQLite 默认易在后台并发请求时锁库，表现为偶发超时 / 断连
    try {
      await this.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
      await this.$queryRawUnsafe('PRAGMA busy_timeout=8000;');
      await this.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
      await this.$queryRawUnsafe('PRAGMA foreign_keys=ON;');
    } catch (err) {
      this.logger.warn(`SQLite PRAGMA 设置失败: ${(err as Error)?.message || err}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
