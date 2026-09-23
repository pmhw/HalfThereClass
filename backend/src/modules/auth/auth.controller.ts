import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { WxLoginDto } from './dto/wx-login.dto';
import { MobileLoginDto } from './dto/mobile-login.dto';
import { SendSmsDto, SmsLoginDto } from './dto/sms-login.dto';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('agreement')
  @ApiOperation({ summary: '用户协议' })
  agreement() {
    return this.authService.getAgreement();
  }

  @Get('sms/status')
  @ApiOperation({ summary: '短信登录是否可用' })
  smsStatus() {
    return this.authService.smsStatus();
  }

  @Post('sms/send')
  @ApiOperation({ summary: '发送登录验证码' })
  sendSms(@Body() dto: SendSmsDto, @Req() req: any) {
    return this.authService.sendSmsCode(dto.phone, req);
  }

  @Post('sms/login')
  @ApiOperation({ summary: '手机号验证码登录/注册' })
  smsLogin(@Body() dto: SmsLoginDto, @Req() req: any) {
    return this.authService.smsLogin(dto, req);
  }

  @Post('wx-login')
  @ApiOperation({ summary: '微信登录' })
  wxLogin(@Body() wxLoginDto: WxLoginDto) {
    return this.authService.wxLogin(wxLoginDto);
  }

  @Post('mobile-login')
  @ApiOperation({ summary: '已停用：请改用短信登录' })
  mobileLogin(@Body() _dto: MobileLoginDto) {
    return this.authService.mobileLogin();
  }
}
