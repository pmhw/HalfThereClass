import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScheduleService } from './schedule.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '@/common/guards/optional-jwt.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('课表')
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get('calendar')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '月课表' })
  calendar(@Query('month') month: string, @CurrentUser('userId') userId?: number) {
    return this.scheduleService.calendar(month, userId);
  }

  @Get('teaching')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我任教的课程' })
  teaching(@CurrentUser('userId') userId: number) {
    return this.scheduleService.teaching(userId);
  }

  @Post('adjust')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '老师登记调课、加课、停课、听课' })
  adjust(@CurrentUser('userId') userId: number, @Body() body: any) {
    return this.scheduleService.adjust(userId, body);
  }
}
