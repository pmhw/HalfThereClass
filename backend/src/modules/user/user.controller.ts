import { Body, Controller, Get, Post, Put, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { SubmitCertDto } from './dto/submit-cert.dto';

@ApiTags('用户')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取用户信息' })
  getProfile(@CurrentUser('userId') userId: number) {
    return this.userService.findById(userId);
  }

  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '上传微信头像' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadAvatar(
    @CurrentUser('userId') userId: number,
    @UploadedFile() file: { buffer?: Buffer },
  ) {
    return this.userService.saveAvatar(userId, file);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新用户信息' })
  updateProfile(
    @CurrentUser('userId') userId: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.update(userId, updateUserDto);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取用户学习统计' })
  getStats(@CurrentUser('userId') userId: number) {
    return this.userService.getUserStats(userId);
  }

  @Get('cert')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '教师认证状态' })
  getCert(@CurrentUser('userId') userId: number) {
    return this.userService.getCert(userId);
  }

  @Post('cert-file')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '上传认证材料' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadCertFile(@UploadedFile() file: { buffer?: Buffer }) {
    return this.userService.saveCertFile(file);
  }

  @Post('cert')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交教师认证' })
  submitCert(@CurrentUser('userId') userId: number, @Body() dto: SubmitCertDto) {
    return this.userService.submitCert(userId, dto);
  }

  @Get('contract')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '教师服务合同' })
  getContract(@CurrentUser('userId') userId: number) {
    return this.userService.getContract(userId);
  }

  @Get('contract/export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '导出合同 HTML（可打印为 PDF）' })
  exportContract(
    @CurrentUser('userId') userId: number,
    @Query('id') id?: string,
  ) {
    return this.userService.exportContractHtml(userId, id ? Number(id) : undefined);
  }

  @Get('contract/export-file')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '下载合同文件（HTML，浏览器/小程序可打开后另存 PDF）' })
  async exportContractFile(
    @CurrentUser('userId') userId: number,
    @Query('id') id?: string,
  ) {
    const data = await this.userService.exportContractFile(userId, id ? Number(id) : undefined);
    const buf = Buffer.from(data.html || '', 'utf8');
    const fileName = data.fileName || `教师服务合同-${data.id}.html`;
    return new StreamableFile(buf, {
      type: 'text/html; charset=utf-8',
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
  }

  @Get('contracts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的合同历史' })
  listContracts(@CurrentUser('userId') userId: number) {
    return this.userService.listMyContracts(userId);
  }

  @Post('contract')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '签订教师服务合同' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  signContract(
    @CurrentUser('userId') userId: number,
    @UploadedFile() file: { buffer?: Buffer },
  ) {
    return this.userService.signContract(userId, file);
  }
}
