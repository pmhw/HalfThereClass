import { Controller, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('支付')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('wx/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '发起微信支付' })
  createWxPayment(
    @Param('orderId') orderId: string,
    @CurrentUser('userId') userId: number,
  ) {
    return this.paymentService.createWxPayment(Number(orderId), userId);
  }

  @Post('wx/notify')
  @ApiOperation({ summary: '微信支付回调' })
  wxNotify(@Body() notifyData: any) {
    return this.paymentService.handleWxNotify(notifyData);
  }
}
