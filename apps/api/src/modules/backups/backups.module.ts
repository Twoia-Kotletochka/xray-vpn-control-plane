import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

@Module({
  imports: [AuditLogModule],
  controllers: [BackupsController],
  providers: [BackupsService],
})
export class BackupsModule {}
