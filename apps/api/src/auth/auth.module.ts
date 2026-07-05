import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { getAccessSecret } from './jwt-secret';

@Module({
  imports: [
    // registerAsync so the secret is resolved lazily at module init (after
    // dotenv/config has populated process.env in main.ts), not at import time.
    // No in-code fallback: getAccessSecret() throws if the env is unset (§9).
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({ secret: getAccessSecret() }),
    }),
  ],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
