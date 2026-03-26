import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin.interface';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { BackupsService } from './backups.service';
import { CreateBackupDto } from './dto/create-backup.dto';

@Controller('backups')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get()
  list() {
    return this.backupsService.list();
  }

  @Post()
  create(
    @Body() payload: CreateBackupDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() request: Request,
  ) {
    return this.backupsService.create(payload, admin, request);
  }

  @Get(':backupId/download')
  async download(
    @Param('backupId') backupId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const download = await this.backupsService.prepareDownload(backupId);

    response.setHeader('Content-Type', 'application/gzip');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${download.fileName.replace(/"/g, '')}"`,
    );

    return new StreamableFile(download.stream);
  }

  @Get(':backupId/restore-plan')
  getRestorePlan(@Param('backupId') backupId: string) {
    return this.backupsService.getRestorePlan(backupId);
  }

  @Delete(':backupId')
  remove(
    @Param('backupId') backupId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() request: Request,
  ) {
    return this.backupsService.remove(backupId, admin, request);
  }
}
