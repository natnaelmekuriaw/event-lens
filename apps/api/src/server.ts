import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { AuthService } from './auth/auth.service.js';
import { ApiExceptionFilter } from './http.js';
import { httpLogger } from './logger.js';
import { createAbuseLimiter } from './security.js';

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: ['error', 'warn'],
  });
  app.disable('x-powered-by');
  app.use(httpLogger);
  app.use(helmet());
  app.use(createAbuseLimiter());
  app.use(
    (
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.setGlobalPrefix('api');
  const server = app.getHttpAdapter().getInstance<express.Express>();
  server.all('/api/auth/{*path}', toNodeHandler(app.get(AuthService).auth));
  app.use(express.json({ limit: '32kb', strict: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('EventLens API')
      .setDescription(
        'Phase 1 account, workspace, and project management. Requires a session cookie; public project keys grant no management access.',
      )
      .setVersion('0.1.0')
      .addCookieAuth('better-auth.session_token')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
  await app.init();
  return app;
}
