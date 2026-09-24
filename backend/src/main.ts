import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { verify } from 'jsonwebtoken';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ensureJwtSecret } from './common/security';

function resolveWww() {
  const candidates = [
    join(process.cwd(), 'www'),
    join(process.cwd(), '..', 'www'),
    join(process.cwd(), 'public'),
  ];
  return candidates.find((dir) => existsSync(join(dir, 'index.html'))) || null;
}

function resolveMobileWww() {
  const candidates = [
    join(process.cwd(), 'www-mobile'),
    join(process.cwd(), '..', 'www-mobile'),
    join(process.cwd(), 'www', 'm'),
    join(process.cwd(), '..', 'www', 'm'),
  ];
  return candidates.find((dir) => existsSync(join(dir, 'index.html'))) || null;
}

function resolveVersion() {
  const candidates = [
    join(process.cwd(), 'VERSION'),
    join(process.cwd(), '..', 'VERSION'),
  ];
  for (const file of candidates) {
    if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  }
  return process.env.APP_VERSION || '0.0.0';
}

function extractBearer(req: { headers?: Record<string, any>; query?: Record<string, any> }) {
  const header = String(req.headers?.authorization || '');
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const queryToken = req.query?.access_token || req.query?.token;
  return queryToken ? String(queryToken) : '';
}

function requireUploadAuth(req: any, res: any, next: () => void) {
  const token = extractBearer(req);
  if (!token || !process.env.JWT_SECRET) {
    return res.status(401).type('text/plain').send('unauthorized');
  }
  try {
    verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).type('text/plain').send('unauthorized');
  }
}

async function bootstrap() {
  ensureJwtSecret();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const uploadsRoot = join(process.cwd(), 'uploads');

  // 仅公开头像；证件与签名需登录；备份/更新包不对外静态暴露
  app.useStaticAssets(join(uploadsRoot, 'avatars'), { prefix: '/uploads/avatars/' });
  app.use('/uploads/certs', requireUploadAuth);
  app.useStaticAssets(join(uploadsRoot, 'certs'), { prefix: '/uploads/certs/' });
  app.use('/uploads/signs', requireUploadAuth);
  app.useStaticAssets(join(uploadsRoot, 'signs'), { prefix: '/uploads/signs/' });

  const www = resolveWww();
  if (www) {
    app.useStaticAssets(www, { index: false });
  }
  const mobileWww = resolveMobileWww();
  if (mobileWww) {
    app.useStaticAssets(mobileWww, { prefix: '/m/', index: false });
  }

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const corsOrigin = String(process.env.CORS_ORIGIN || '').trim();
  if (corsOrigin) {
    const allowlist = corsOrigin.split(',').map((item) => item.trim()).filter(Boolean);
    app.enableCors({
      origin: (origin, callback) => {
        if (!origin || allowlist.includes(origin) || allowlist.includes('*')) {
          callback(null, true);
          return;
        }
        callback(new Error('Not allowed by CORS'), false);
      },
      credentials: true,
    });
  } else if (process.env.NODE_ENV === 'production') {
    // 生产默认同源：无 Origin 的服务端/小程序请求放行，浏览器跨域需配置 CORS_ORIGIN
    app.enableCors({ origin: false });
  } else {
    app.enableCors();
  }

  const version = resolveVersion();
  process.env.APP_VERSION = version;

  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === '1') {
    const config = new DocumentBuilder()
      .setTitle('半堂课 API 文档')
      .setDescription('课程平台后端接口文档')
      .setVersion(version)
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  if (mobileWww) {
    const server = app.getHttpAdapter().getInstance();
    server.get(/^\/m(?:\/.*)?$/, (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const rel = String(req.path || '').replace(/^\/m\/?/, '');
      if (rel && existsSync(join(mobileWww, rel))) return next();
      return res.sendFile(join(mobileWww, 'index.html'));
    });
  }

  if (www) {
    const server = app.getHttpAdapter().getInstance();
    server.get(/^\/(?!api(?:\/|$)|uploads(?:\/|$)|m(?:\/|$)).*/, (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path !== '/' && existsSync(join(www, req.path))) return next();
      return res.sendFile(join(www, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  try {
    await app.listen(port);
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
      console.error(`端口 ${port} 已被占用。请修改 backend/.env 的 PORT，或结束占用该端口的进程后重启。`);
    }
    throw err;
  }
  console.log(`🚀 服务运行于 http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === '1') {
    console.log(`📖 API 文档: http://localhost:${port}/api/docs`);
  }
  if (www) console.log(`🖥️  管理后台: http://localhost:${port}/`);
  if (mobileWww) console.log(`📱 手机端: http://localhost:${port}/m/`);
  console.log(`📦 版本: ${version}`);
}

bootstrap().catch((err) => {
  console.error('服务启动失败:', err?.stack || err?.message || err);
  process.exit(1);
});
