import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  AGREEMENT_BODY_KEY,
  AGREEMENT_TITLE_KEY,
  DEFAULT_AGREEMENT,
} from '@/common/agreement';
import { UserService } from '../user/user.service';
import { WxLoginDto } from './dto/wx-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async getAgreement() {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: [AGREEMENT_TITLE_KEY, AGREEMENT_BODY_KEY] } },
    });
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      title: map[AGREEMENT_TITLE_KEY]?.trim() || DEFAULT_AGREEMENT.title,
      content: map[AGREEMENT_BODY_KEY]?.trim() || DEFAULT_AGREEMENT.content,
    };
  }

  // 微信登录
  async wxLogin(wxLoginDto: WxLoginDto) {
    const nickname = wxLoginDto.nickname?.trim();
    const avatar = wxLoginDto.avatar?.trim();
    const openid = await this.getWxOpenid(wxLoginDto.code);

    let user = await this.userService.findByOpenid(openid);
    if (!user) {
      user = await this.userService.create(openid, { nickname, avatar });
    } else {
      user = await this.userService.applyLogin(user.id, { nickname, avatar });
    }

    const token = await this.generateToken(user.id, user.openid, user.role);

    return {
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
      },
    };
  }

  private async getWxOpenid(code: string): Promise<string> {
    const appid = process.env.WX_APPID || '';
    const secret = process.env.WX_SECRET || '';
    const ready = appid && secret && !appid.includes('your-') && !secret.includes('your-');
    if (!ready) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('微信登录未配置');
      }
      return 'dev-teacher';
    }
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const response = await fetch(url);
    const data = await response.json() as { openid?: string; errmsg?: string };
    if (!data.openid) throw new UnauthorizedException(data.errmsg || '微信登录失败');
    return data.openid;
  }

  private async generateToken(
    userId: number,
    openid: string,
    role: string,
  ): Promise<string> {
    const payload = { userId, openid, role };
    return this.jwtService.signAsync(payload);
  }
}
