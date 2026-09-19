import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CourseService } from './course.service';
import { CourseListDto } from './dto/course-list.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '@/common/guards/optional-jwt.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('课程')
@Controller('courses')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '课程列表' })
  getList(@Query() query: CourseListDto, @CurrentUser('userId') userId?: number) {
    return this.courseService.getCourseList(query, userId);
  }

  @Get('recommend')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '推荐课程' })
  getRecommend(@Query('limit') limit?: string, @CurrentUser('userId') userId?: number) {
    return this.courseService.getRecommendCourses(Number(limit) || 6, userId);
  }

  @Get('hot')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '热门课程' })
  getHot(@Query('limit') limit?: string, @CurrentUser('userId') userId?: number) {
    return this.courseService.getHotCourses(Number(limit) || 10, userId);
  }

  @Get('today')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '今日课程' })
  getToday(@CurrentUser('userId') userId?: number) {
    return this.courseService.getToday(userId);
  }

  @Get('schedule')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '课程时刻表' })
  getSchedule(@CurrentUser('userId') userId?: number) {
    return this.courseService.getSchedule(userId);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的课程' })
  getMyCourses(
    @CurrentUser('userId') userId: number,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '10',
  ) {
    return this.courseService.getMyCourses(userId, Number(page), Number(pageSize));
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '课程详情' })
  getDetail(@Param('id') id: string, @CurrentUser('userId') userId?: number) {
    return this.courseService.getCourseDetail(Number(id), userId);
  }

  @Post(':id/grab')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '抢课' })
  grab(@Param('id') id: string, @CurrentUser('userId') userId: number) {
    return this.courseService.grabCourse(Number(id), userId);
  }

  @Get(':id/checkin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '签到状态' })
  getCheckIn(@Param('id') id: string, @CurrentUser('userId') userId: number) {
    return this.courseService.getCheckIn(Number(id), userId);
  }

  @Post(':id/checkin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '上课签到' })
  checkIn(@Param('id') id: string, @CurrentUser('userId') userId: number) {
    return this.courseService.checkIn(Number(id), userId);
  }
}
