import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  AGREEMENT_BODY_KEY,
  AGREEMENT_TITLE_KEY,
  DEFAULT_AGREEMENT,
} from '@/common/agreement';
import { clientIp, rateLimit } from '@/common/security';
import { SmsService } from '../sms/sms.service';
import { UserService } from '../user/user.service';
import { WxLoginDto } from './dto/wx-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private smsService: SmsService,
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

  smsStatus() {
    return this.smsService.getStatus();
  }

  sendSmsCode(phone: string, req?: any) {
    return this.smsService.sendLoginCode(phone, req);
  }

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

    return this.issueSession(user);
  }

  async smsLogin(
    dto: { phone: string; code: string; nickname?: string; avatar?: string },
    req?: { ip?: string; headers?: Record<string, any>; socket?: { remoteAddress?: string } },
  ) {
    if (process.env.MOBILE_LOGIN === '0' || process.env.MOBILE_LOGIN === 'false') {
      throw new UnauthorizedException('手机网页登录已关闭');
    }
    rateLimit(`sms-login:${clientIp(req)}`, 40, 15 * 60 * 1000);
    const phone = this.smsService.consumeLoginCode(dto.phone, dto.code);
    const nickname = dto.nickname?.trim();
    const avatar = dto.avatar?.trim();

    let user = await this.userService.findByPhone(phone);
    if (!user) {
      rateLimit(`sms-register:${clientIp(req)}`, 20, 60 * 60 * 1000);
      user = await this.userService.create(`phone:${phone}`, { nickname, avatar, phone });
    } else {
      user = await this.userService.applyLogin(user.id, { nickname, avatar, phone });
    }

    return this.issueSession(user);
  }

  /** 已登录的微信用户绑定手机号；若手机号已有 H5 账号则合并并保留认证 */
  async bindPhone(
    userId: number,
    dto: { phone: string; code: string },
    req?: { ip?: string; headers?: Record<string, any>; socket?: { remoteAddress?: string } },
  ) {
    rateLimit(`sms-bind:${clientIp(req)}`, 40, 15 * 60 * 1000);
    const phone = this.smsService.consumeLoginCode(dto.phone, dto.code);
    const user = await this.userService.bindPhoneAndMerge(userId, phone);
    return this.issueSession(user);
  }

  /** 设备号登录已停用 */
  async mobileLogin() {
    throw new BadRequestException('请使用手机号验证码登录');
  }

  private issueSession(user: {
    id: number;
    openid: string;
    role: string;
    nickname?: string | null;
    avatar?: string | null;
    phone?: string | null;
    status: number;
  }) {
    return this.generateToken(user.id, user.openid, user.role).then((token) => ({
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
      expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    }));
  }

  private async getWxOpenid(code: string): Promise<string> {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: ['wxAppId', 'wxAppSecret'] } },
    });
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const appid = this.pickWxValue(map.wxAppId, process.env.WX_APPID);
    const secret = this.pickWxValue(map.wxAppSecret, process.env.WX_SECRET);
    if (!appid || !secret) {
      if (process.env.ALLOW_DEV_WX === '1' && process.env.NODE_ENV !== 'production') {
        return 'dev-teacher';
      }
      throw new UnauthorizedException('微信登录未配置，请在后台「系统设置 → 小程序」填写 AppID 和 AppSecret');
    }
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const response = await fetch(url);
    const data = await response.json() as { openid?: string; errmsg?: string };
    if (!data.openid) throw new UnauthorizedException(data.errmsg || '微信登录失败');
    return data.openid;
  }

  private pickWxValue(stored?: string | null, envValue?: string) {
    const fromDb = String(stored || '').trim();
    if (fromDb && !fromDb.includes('your-')) return fromDb;
    const fromEnv = String(envValue || '').trim();
    if (fromEnv && !fromEnv.includes('your-')) return fromEnv;
    return '';
  }

  private async generateToken(userId: number, openid: string, role: string): Promise<string> {
    return this.jwtService.signAsync({ userId, openid, role });
  }
}
