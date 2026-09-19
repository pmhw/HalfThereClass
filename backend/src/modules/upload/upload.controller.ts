import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

@ApiTags('上传')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Get('token')
  @ApiOperation({ summary: '获取上传凭证' })
  getToken(@Query('prefix') prefix?: string) {
    if (prefix) {
      return this.uploadService.getUploadTokenWithPrefix(prefix);
    }
    return this.uploadService.getUploadToken();
  }
}
