import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

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
  app.enableCors();

  const version = resolveVersion();
  process.env.APP_VERSION = version;
  const config = new DocumentBuilder()
    .setTitle('半堂课 API 文档')
    .setDescription('课程平台后端接口文档')
    .setVersion(version)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

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

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 服务运行于 http://localhost:${port}`);
  console.log(`📖 API 文档: http://localhost:${port}/api/docs`);
  if (www) console.log(`🖥️  管理后台: http://localhost:${port}/`);
  if (mobileWww) console.log(`📱 手机端: http://localhost:${port}/m/`);
  console.log(`📦 版本: ${version}`);
}
bootstrap();
