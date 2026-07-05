// Load .env into process.env before anything reads it (deterministic ordering
// for the now-fallback-free JWT secret resolution). dotenv never overrides vars
// already set by the environment (e.g. docker-compose in prod).
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { getAccessSecret, getRefreshSecret } from './auth/jwt-secret';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Fail fast if JWT secrets are missing/weak — refuse to boot on a default key
  // (§9, GAP §4.1.3). Throws a clear error before the HTTP listener starts.
  getAccessSecret();
  getRefreshSecret();

  const app = await NestFactory.create(AppModule);

  const isProd = process.env.NODE_ENV === 'production';

  // Security headers (helmet). Enable CSP in production; the SPA is served
  // separately (nginx) so the API itself only returns JSON.
  app.use(
    helmet({
      // The API returns JSON only; a restrictive CSP is safe here and blocks
      // any accidental inline-html injection surface.
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // Set standard API prefix
  app.setGlobalPrefix('api/v1');

  // Trust the reverse proxy (nginx / SaftOS ingress) so req.ip reflects the
  // real client for the login rate-limiter instead of the proxy address.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Enable cookie parsing for HttpOnly refresh tokens
  app.use(cookieParser());

  // Global validation pipe for request DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // CORS whitelist. Comma-separated CORS_ORIGINS env wins; FRONTEND_URL is the
  // single-origin fallback for dev. Credentials are enabled for the refresh
  // cookie, so a wildcard origin is never allowed.
  const allowlist = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow same-origin / server-to-server requests that send no Origin header.
      if (!origin || allowlist.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`API Server is running on: http://localhost:${port}/api/v1`);
  logger.log(`CORS allowlist: ${allowlist.join(', ')}`);
}
bootstrap();
