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
    await this.ensureCourseOrgColumns();
    await this.ensureProfitSettleColumns();
    await this.migrateCourseOrgFeeBase();
    await this.ensureMonthlySettleColumns();
    await this.ensureSplitTable();
    await this.ensureReimbursementColumns();
  }

  private async ensureReimbursementColumns() {
    try {
      const cols = await this.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info(reimbursements)');
      const names = new Set((cols || []).map((row) => row.name));
      if (!names.size) return;
      if (!names.has('month')) {
        await this.$executeRawUnsafe('ALTER TABLE "reimbursements" ADD COLUMN "month" TEXT');
      }
      if (!names.has('split_collection_id')) {
        await this.$executeRawUnsafe('ALTER TABLE "reimbursements" ADD COLUMN "split_collection_id" INTEGER');
      }
      await this.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "reimbursements_month_idx" ON "reimbursements"("month")');
      await this.$executeRawUnsafe(
        `UPDATE "reimbursements" SET "month" = substr("expense_date", 1, 7) WHERE "month" IS NULL AND length("expense_date") >= 7`,
      );
    } catch (err) {
      this.logger.warn(`补齐报销单字段失败: ${(err as Error)?.message || err}`);
    }
  }

  private async ensureSplitTable() {
    try {
      await this.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "split_collections" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL,
        "course_ids" TEXT NOT NULL DEFAULT '[]',
        "members" TEXT NOT NULL DEFAULT '[]',
        "note" TEXT,
        "sort" INTEGER NOT NULL DEFAULT 0,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL
      )`);
    } catch (err) {
      this.logger.warn(`创建分成合集表失败: ${(err as Error)?.message || err}`);
    }
    try {
      await this.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "split_payouts" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "month" TEXT NOT NULL,
        "payee_key" TEXT NOT NULL,
        "user_id" INTEGER,
        "name" TEXT NOT NULL,
        "gross" REAL NOT NULL DEFAULT 0,
        "tax" REAL NOT NULL DEFAULT 0,
        "fee" REAL NOT NULL DEFAULT 0,
        "net" REAL NOT NULL DEFAULT 0,
        "detail" TEXT NOT NULL DEFAULT '[]',
        "status" TEXT NOT NULL DEFAULT 'unpaid',
        "paid_at" DATETIME,
        "paid_by" INTEGER,
        "note" TEXT,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL
      )`);
      await this.$executeRawUnsafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS "split_payouts_month_payee_key_key" ON "split_payouts"("month", "payee_key")',
      );
      await this.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "split_payouts_month_idx" ON "split_payouts"("month")');
    } catch (err) {
      this.logger.warn(`创建财务打款表失败: ${(err as Error)?.message || err}`);
    }
  }

  private async ensureMonthlySettleColumns() {
    try {
      const cols = await this.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info(monthly_settlements)');
      const names = new Set((cols || []).map((row) => row.name));
      if (!names.has('locked')) {
        await this.$executeRawUnsafe(`ALTER TABLE "monthly_settlements" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false`);
        // 历史已结算的月份视为已固定，只在补列时做一次，否则「解除固定」重启后又会被锁回去
        await this.$executeRawUnsafe(
          `UPDATE "monthly_settlements" SET "locked" = 1, "locked_at" = COALESCE("locked_at", "settled_at") WHERE "status" = 'settled' AND "locked" = 0`,
        );
      }
      if (!names.has('locked_at')) {
        await this.$executeRawUnsafe('ALTER TABLE "monthly_settlements" ADD COLUMN "locked_at" DATETIME');
      }
      if (!names.has('locked_by')) {
        await this.$executeRawUnsafe('ALTER TABLE "monthly_settlements" ADD COLUMN "locked_by" INTEGER');
      }
      if (!names.has('cost_amount')) {
        await this.$executeRawUnsafe('ALTER TABLE "monthly_settlements" ADD COLUMN "cost_amount" REAL NOT NULL DEFAULT 0');
      }
      if (!names.has('session_count')) {
        await this.$executeRawUnsafe('ALTER TABLE "monthly_settlements" ADD COLUMN "session_count" INTEGER NOT NULL DEFAULT 0');
      }
    } catch (err) {
      this.logger.warn(`补齐月度结算字段失败: ${(err as Error)?.message || err}`);
    }
  }

  private async ensureProfitSettleColumns() {
    try {
      const cols = await this.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info(profit_records)');
      const names = new Set((cols || []).map((row) => row.name));
      if (!names.has('session_fee')) {
        await this.$executeRawUnsafe('ALTER TABLE "profit_records" ADD COLUMN "session_fee" REAL');
      }
      if (!names.has('settle_to')) {
        await this.$executeRawUnsafe(`ALTER TABLE "profit_records" ADD COLUMN "settle_to" TEXT NOT NULL DEFAULT 'teacher'`);
      }
      if (!names.has('org_settle_amount')) {
        await this.$executeRawUnsafe('ALTER TABLE "profit_records" ADD COLUMN "org_settle_amount" REAL NOT NULL DEFAULT 0');
      }
    } catch (err) {
      this.logger.warn(`补齐利润结算字段失败: ${(err as Error)?.message || err}`);
    }
  }

  /**
   * 旧版承接机构课把课程课时费改写成了「校方价 − 机构抽成」。
   * 新版抽成按课时费计算：一次性把这些课的课时费恢复为校方价，保证历史数字不变，
   * 之后由管理员按实际课时费调整（平台利润 = 校方价 − 课时费）。
   */
  private async migrateCourseOrgFeeBase() {
    const key = 'course_org_fee_base_v2';
    try {
      const done = await this.appSetting.findUnique({ where: { key } });
      if (done) return;
      const changed = await this.$executeRawUnsafe(
        'UPDATE "courses" SET "session_fee" = "price" WHERE "organization_id" IS NOT NULL',
      );
      await this.appSetting.create({ data: { key, value: new Date().toISOString() } });
      if (changed) this.logger.log(`承接机构课程课时费已按新口径恢复：${changed} 门`);
    } catch (err) {
      this.logger.warn(`承接机构课时费口径迁移失败: ${(err as Error)?.message || err}`);
    }
  }

  /**
   * 机构按课抽成字段：老库若 migrate 未成功，接口会因缺列整页 500。
   * 启动时补齐列，避免机构管理一直弹「服务器内部错误」。
   */
  private async ensureCourseOrgColumns() {
    try {
      const cols = await this.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info(courses)');
      const names = new Set((cols || []).map((row) => row.name));
      if (!names.has('organization_id')) {
        await this.$executeRawUnsafe('ALTER TABLE "courses" ADD COLUMN "organization_id" INTEGER');
        this.logger.log('已补齐 courses.organization_id');
      }
      if (!names.has('org_commission_mode')) {
        await this.$executeRawUnsafe('ALTER TABLE "courses" ADD COLUMN "org_commission_mode" TEXT');
        this.logger.log('已补齐 courses.org_commission_mode');
      }
      if (!names.has('org_commission_value')) {
        await this.$executeRawUnsafe('ALTER TABLE "courses" ADD COLUMN "org_commission_value" REAL');
        this.logger.log('已补齐 courses.org_commission_value');
      }
      await this.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "courses_organization_id_idx" ON "courses"("organization_id")',
      );
    } catch (err) {
      this.logger.warn(`补齐课程机构字段失败: ${(err as Error)?.message || err}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
