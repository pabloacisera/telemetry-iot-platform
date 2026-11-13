import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

function corsOrigins(): boolean | string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw || raw === '*') {
    return true;
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Render terminates TLS at its edge and forwards the original protocol.
  app.set('trust proxy', 1);

  // Parse cookies (needed for refresh token in httpOnly cookie)
  app.use(cookieParser());

  // Global validation pipe: whitelist unknown fields, transform types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: corsOrigins(),
    credentials: true, // Allow cookies to be sent cross-origin
  });

  app.setGlobalPrefix('api');

  // Serve the React build when it exists (Render single-container image).
  const publicDir = join(__dirname, '..', 'public');
  if (existsSync(publicDir)) {
    app.useStaticAssets(publicDir);

    // SPA fallback: let React Router handle client-side routes. Keep /api and
    // /socket.io untouched so NestJS and Socket.IO keep working.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') {
        return next();
      }
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
      }
      if (extname(req.path) || !req.accepts('html')) {
        return next();
      }
      res.sendFile(join(publicDir, 'index.html'));
    });
  }

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
