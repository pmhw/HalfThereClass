import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { OrderService } from '../order/order.service';

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private orderService: OrderService,
  ) {}

  // 发起微信支付（正式验签接入前不开放真实扣款）
  async createWxPayment(orderId: number, userId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId, status: 'pending' },
    });

    if (!order) {
      throw new NotFoundException('订单不存在或状态异常');
    }

    throw new BadRequestException('微信支付尚未完成安全接入，暂不可支付');
  }

  // 支付回调：未验签前一律拒绝，防止伪造通知直接标已付
  async handleWxNotify(_notifyData: any) {
    return { code: 'FAIL', message: 'payment notify disabled until signature verification is enabled' };
  }
}
