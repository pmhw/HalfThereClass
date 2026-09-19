import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CommentService } from './comment.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CreateCommentDto } from './dto/create-comment.dto';

@ApiTags('评论')
@Controller('comments')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Get('course/:courseId')
  @ApiOperation({ summary: '获取课程评论列表' })
  getList(
    @Param('courseId') courseId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '10',
  ) {
    return this.commentService.getCommentList(
      Number(courseId),
      Number(page),
      Number(pageSize),
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '发表评论' })
  createComment(
    @CurrentUser('userId') userId: number,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentService.createComment(userId, dto);
  }
}
