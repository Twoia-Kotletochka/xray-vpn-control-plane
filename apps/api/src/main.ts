import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import type { AppEnv } from './common/config/env.schema';
import { FileConsoleLogger } from './common/logging/file-console.logger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService<AppEnv, true>);
  const apiPort = configService.get('API_PORT', { infer: true });
  const corsOrigin = configService.get('API_CORS_ORIGIN', { infer: true });
  const apiLogFile = configService.get('API_LOG_FILE', { infer: true });
  app.useLogger(new FileConsoleLogger(undefined, apiLogFile));

  const httpServer = app.getHttpAdapter().getInstance() as {
    set?: (key: string, value: number) => void;
  };
  httpServer.set?.('trust proxy', 1);
  app.setGlobalPrefix('api', {
    exclude: ['healthz', 'readyz'],
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: {
        policy: 'cross-origin',
      },
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    credentials: true,
    origin: corsOrigin,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(apiPort, '0.0.0.0');
}

void bootstrap();
