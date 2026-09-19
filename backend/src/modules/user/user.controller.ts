import { Body, Controller, Get, Post, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
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
