import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '@/common/prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('请先登录');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
      request['user'] = payload;
      await this.assertActiveUser(payload);
    } catch (err) {
      if (err instanceof ForbiddenException || err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('登录已过期，请重新登录');
    }

    return true;
  }

  private async assertActiveUser(payload: { userId?: number; role?: string }) {
    if (!payload?.userId || payload.role === 'admin') return;
    const user = await this.prisma.user.findUnique({
      where: { id: Number(payload.userId) },
      select: { status: true },
    });
    if (!user) throw new UnauthorizedException('登录已过期，请重新登录');
    if (user.status !== 1) throw new ForbiddenException('账号已冻结');
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
