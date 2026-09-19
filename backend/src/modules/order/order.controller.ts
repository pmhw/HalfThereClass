import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';

@ApiTags('订单')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @ApiOperation({ summary: '创建订单' })
  createOrder(
    @CurrentUser('userId') userId: number,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(userId, dto.courseId);
  }

  @Get()
  @ApiOperation({ summary: '订单列表' })
  getList(
    @CurrentUser('userId') userId: number,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '10',
    @Query('status') status?: string,
  ) {
    return this.orderService.getOrderList(
      userId,
      Number(page),
      Number(pageSize),
      status,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '订单详情' })
  getDetail(
    @Param('id') id: string,
    @CurrentUser('userId') userId: number,
  ) {
    return this.orderService.getOrderDetail(Number(id), userId);
  }
}
