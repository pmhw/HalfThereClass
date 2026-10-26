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
import { ensureAdminEntry, ensureJwtSecret } from './common/security';
import { PrismaService } from './common/prisma/prisma.service';

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

/**
 * 后台构建 base 为 './'：在 /finance/statement 等深层路由刷新时，
 * 浏览器会把 ./assets 解析成 /{entry}/finance/assets → 404 白屏。
 * 下发 index.html 时注入 <base> 并改写资源为入口绝对路径。
 */
function sendAdminIndex(res: any, wwwDir: string, adminPrefix: string) {
  const file = join(wwwDir, 'index.html');
  let html = readFileSync(file, 'utf8');
  const base = adminPrefix.endsWith('/') ? adminPrefix : `${adminPrefix}/`;
  if (!/<base\s/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n    <base href="${base}">`);
  }
  html = html
    .replace(/(src|href)=["']\.\/assets\//g, `$1="${base}assets/`)
    .replace(/(src|href)=["']\.\/favicon/g, `$1="${base}favicon`);
  // 更新后旧资源文件已删除，入口页不能被缓存，否则刷新会加载不存在的旧 js 导致白屏
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(html);
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

/**
 * 高德 JS API 安全密钥代理（官方 serviceHost 方式）：手机网页只拿 Key，
 * 请求经此转发时由服务端附加 jscode，避免安全密钥下发到浏览器。
 */
function amapServiceProxy(prisma: PrismaService) {
  let cached = { value: '', at: 0 };
  const security = async () => {
    if (Date.now() - cached.at < 60_000) return cached.value;
    const row = await prisma.appSetting.findUnique({ where: { key: 'amapSecurity' }, select: { value: true } });
    cached = { value: String(row?.value || '').trim(), at: Date.now() };
    return cached.value;
  };
  return async (req: any, res: any) => {
    if (req.method !== 'GET') return res.status(405).type('text/plain').send('method not allowed');
    const jscode = await security().catch(() => '');
    if (!jscode) return res.status(404).type('text/plain').send('amap not configured');
    const path = String(req.path || '/');
    const origin = path.startsWith('/v4/map/styles')
      ? 'https://webapi.amap.com'
      : path.startsWith('/v3/vectormap')
        ? 'https://fmap01.amap.com'
        : 'https://restapi.amap.com';
    const query = new URLSearchParams(req.query as Record<string, string>);
    query.set('jscode', jscode);
    try {
      const upstream = await fetch(`${origin}${path}?${query.toString()}`);
      const type = upstream.headers.get('content-type');
      if (type) res.setHeader('Content-Type', type);
      res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      res.status(502).type('text/plain').send('amap upstream error');
    }
  };
}

async function bootstrap() {
  ensureJwtSecret();
  const adminEntry = ensureAdminEntry();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const uploadsRoot = join(process.cwd(), 'uploads');

  // 仅公开头像；证件与签名需登录；备份/更新包不对外静态暴露
  app.useStaticAssets(join(uploadsRoot, 'avatars'), { prefix: '/uploads/avatars/' });
  app.use('/uploads/certs', requireUploadAuth);
  app.useStaticAssets(join(uploadsRoot, 'certs'), { prefix: '/uploads/certs/' });
  app.use('/uploads/signs', requireUploadAuth);
  app.useStaticAssets(join(uploadsRoot, 'signs'), { prefix: '/uploads/signs/' });
  app.use('/uploads/reimbursements', requireUploadAuth);
  app.useStaticAssets(join(uploadsRoot, 'reimbursements'), { prefix: '/uploads/reimbursements/' });

  // 高德要求代理以 _AMapService 作为一级路由，不能挂在 /api 下
  app.use('/_AMapService', amapServiceProxy(app.get(PrismaService)));

  const www = resolveWww();
  const adminPrefix = `/${adminEntry}`;
  if (www) {
    // 管理后台仅挂在 /{ADMIN_ENTRY}/ 下，域名根路径不提供后台
    app.useStaticAssets(www, { prefix: `${adminPrefix}/`, index: false });
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
      exposedHeaders: ['X-Finance-Token', 'X-Finance-Expires'],
    });
  } else {
    app.enableCors({ origin: true, credentials: true, exposedHeaders: ['X-Finance-Token', 'X-Finance-Expires'] });
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

  const server = app.getHttpAdapter().getInstance();

  if (mobileWww) {
    server.get(/^\/m(?:\/.*)?$/, (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const rel = String(req.path || '').replace(/^\/m\/?/, '');
      if (rel && existsSync(join(mobileWww, rel))) return next();
      res.setHeader('Cache-Control', 'no-store');
      return res.sendFile(join(mobileWww, 'index.html'));
    });
  }

  if (www) {
    const entryRe = new RegExp(`^/${adminEntry}(?:/.*)?$`);
    server.get(entryRe, (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const rel = String(req.path || '').replace(new RegExp(`^/${adminEntry}/?`), '');
      if (rel && existsSync(join(www, rel))) return next();
      return sendAdminIndex(res, www, adminPrefix);
    });
  }

  // 域名根及其他未知路径不暴露后台
  server.get('/', (_req, res) => {
    res.status(404).type('text/plain').send('Not Found');
  });

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
  if (www) {
    console.log(`🖥️  管理后台: http://localhost:${port}${adminPrefix}/`);
    console.log(`🔒 后台入口后缀 ADMIN_ENTRY=${adminEntry}（请收藏完整地址，勿泄露）`);
  }
  if (mobileWww) console.log(`📱 手机端: http://localhost:${port}/m/`);
  console.log(`📦 版本: ${version}`);
}

bootstrap().catch((err) => {
  console.error('服务启动失败:', err?.stack || err?.message || err);
  process.exit(1);
});
