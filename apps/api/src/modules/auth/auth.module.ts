import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { AdminAuthGuard } from '../../common/auth/admin-auth.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginAttemptService } from './login-attempt.service';

@Module({
  imports: [JwtModule.register({}), AuditLogModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    LoginAttemptService,
    AdminBootstrapService,
    AdminAuthGuard,
    {
      provide: APP_GUARD,
      useExisting: AdminAuthGuard,
    },
  ],
})
export class AuthModule {}
