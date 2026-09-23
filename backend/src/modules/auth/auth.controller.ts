import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { WxLoginDto } from './dto/wx-login.dto';
import { MobileLoginDto } from './dto/mobile-login.dto';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('agreement')
  @ApiOperation({ summary: '用户协议' })
  agreement() {
    return this.authService.getAgreement();
  }

  @Post('wx-login')
  @ApiOperation({ summary: '微信登录' })
  wxLogin(@Body() wxLoginDto: WxLoginDto) {
    return this.authService.wxLogin(wxLoginDto);
  }

  @Post('mobile-login')
  @ApiOperation({ summary: '手机网页登录' })
  mobileLogin(@Body() dto: MobileLoginDto) {
    return this.authService.mobileLogin(dto);
  }
}
