import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LessonService } from './lesson.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UpdateProgressDto } from './dto/update-progress.dto';

@ApiTags('课时')
@Controller('lessons')
export class LessonController {
  constructor(private readonly lessonService: LessonService) {}

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取课时详情' })
  getDetail(
    @Param('id') id: string,
    @CurrentUser('userId') userId: number,
  ) {
    return this.lessonService.getLessonDetail(Number(id), userId);
  }

  @Post(':id/progress')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新学习进度' })
  updateProgress(
    @Param('id') id: string,
    @CurrentUser('userId') userId: number,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.lessonService.updateProgress(Number(id), userId, dto.progress);
  }
}
