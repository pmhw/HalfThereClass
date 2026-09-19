import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { OrderService } from '../order/order.service';

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private orderService: OrderService,
  ) {}

  // 发起微信支付
  async createWxPayment(orderId: number, userId: number) {
    // TODO: 调用微信支付统一下单接口
    // 这里返回 mock 数据，实际需集成 wechatpay-node-v3

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId, status: 'pending' },
    });

    if (!order) {
      throw new Error('订单不存在或状态异常');
    }

    // Mock 支付参数
    return {
      timeStamp: Math.floor(Date.now() / 1000).toString(),
      nonceStr: Math.random().toString(36).substring(2, 15),
      package: `prepay_id=mock_${order.orderNo}`,
      signType: 'RSA',
      paySign: 'mock_pay_signature',
    };
  }

  // 支付回调
  async handleWxNotify(notifyData: any) {
    // TODO: 验证签名，处理支付结果
    const { out_trade_no, transaction_id, result_code } = notifyData;

    if (result_code === 'SUCCESS') {
      const order = await this.prisma.order.findUnique({
        where: { orderNo: out_trade_no },
      });

      if (order && order.status === 'pending') {
        // 更新订单状态
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'paid',
            payType: 'wechat',
            payTime: new Date(),
            transactionId: transaction_id,
            payAmount: order.amount,
          },
        });

        // 发放课程
        await this.orderService.grantCourse(order.userId, order.courseId, order.id);
      }
    }

    return { code: 'SUCCESS', message: 'OK' };
  }
}
