import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './common/config/env.schema';
import { DatabaseModule } from './common/database/database.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { BackupsModule } from './modules/backups/backups.module';
import { ClientsModule } from './modules/clients/clients.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { LogsModule } from './modules/logs/logs.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { SystemModule } from './modules/system/system.module';
import { WireguardModule } from './modules/wireguard/wireguard.module';
import { XrayModule } from './modules/xray/xray.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    AdminUsersModule,
    ClientsModule,
    BackupsModule,
    DashboardModule,
    SystemModule,
    LogsModule,
    AuditLogModule,
    SubscriptionsModule,
    WireguardModule,
    XrayModule,
  ],
})
export class AppModule {}
