import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin.interface';
import type { AppEnv } from '../../common/config/env.schema';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  type BackupArchiveManifest,
  buildBackupRestorePreflight,
  findArchiveEntry,
  parseArchiveEntries,
  parseBackupManifest,
} from './backup-restore.util';
import { isAutomaticBackupDue } from './backup-schedule.util';
import type { CreateBackupDto } from './dto/create-backup.dto';

const execFileAsync = promisify(execFile);
const XRAY_RUNTIME_CONFIG_PATH = '/var/lib/server-vpn/xray/config.json';
const RESTORE_DRY_RUN_PLACEHOLDER =
  './infra/scripts/restore.sh --dry-run --yes-restore /absolute/path/to/archive.tar.gz';
const RESTORE_COMMAND_PLACEHOLDER =
  './infra/scripts/restore.sh --yes-restore /absolute/path/to/archive.tar.gz';

type BackupArchiveArtifact = {
  archivePath: string;
  checksumSha256: string;
  fileName: string;
  fileSizeBytes: bigint;
};

function formatBackupTimestamp(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
    .replace('T', '-');
}

function formatPruneNotes(existingNotes: string | null, prunedAt: Date) {
  const suffix = `Pruned automatically at ${prunedAt.toISOString()}.`;
  return existingNotes ? `${existingNotes}\n${suffix}` : suffix;
}

@Injectable()
export class BackupsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupsService.name);
  private automaticMaintenanceInterval: NodeJS.Timeout | null = null;
  private inflightAutomaticMaintenance: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppEnv, true>,
    private readonly auditLogService: AuditLogService,
  ) {}

  onModuleInit() {
    if (
      this.configService.get('NODE_ENV', { infer: true }) === 'test' ||
      !this.backupAutoCreateEnabled
    ) {
      return;
    }

    this.automaticMaintenanceInterval = setInterval(() => {
      void this.runAutomaticMaintenance('interval');
    }, this.backupAutoMaintenanceIntervalMs);
    this.automaticMaintenanceInterval.unref();

    setTimeout(() => {
      void this.runAutomaticMaintenance('bootstrap');
    }, 15_000).unref();
  }

  onModuleDestroy() {
    if (this.automaticMaintenanceInterval) {
      clearInterval(this.automaticMaintenanceInterval);
    }
  }

  async list() {
    await this.pruneExpiredBackups();

    const items = await this.prisma.backupSnapshot.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      items: items.map((item) => this.serializeBackup(item)),
      policy: {
        backupDir: this.backupDir,
        hostBackupDir: this.backupHostDir,
        autoCreateEnabled: this.backupAutoCreateEnabled,
        autoCreateIntervalDays: this.backupAutoCreateIntervalDays,
        retentionDays: this.backupRetentionDays,
        restoreDryRunCommand: RESTORE_DRY_RUN_PLACEHOLDER,
        restoreCommand: RESTORE_COMMAND_PLACEHOLDER,
      },
    };
  }

  async getRestorePlan(backupId: string) {
    const snapshot = await this.requireBackup(backupId);
    const archivePath = this.buildContainerArchivePath(snapshot.fileName);

    if (!existsSync(archivePath)) {
      throw new NotFoundException('Backup archive is not available.');
    }

    const archiveEntries = await this.listArchiveEntries(archivePath);
    const manifestEntry = findArchiveEntry(archiveEntries, 'manifest.json');
    let manifest: BackupArchiveManifest | null = null;
    let manifestError: string | null = null;

    if (manifestEntry) {
      try {
        const manifestRaw = await this.readArchiveEntry(archivePath, manifestEntry);
        manifest = parseBackupManifest(manifestRaw);
      } catch (error) {
        manifestError =
          error instanceof Error ? error.message : 'Backup manifest could not be parsed.';
      }
    }

    const actualChecksumSha256 = await this.calculateSha256(archivePath);
    const preflight = buildBackupRestorePreflight({
      actualChecksumSha256,
      archiveEntries,
      expectedChecksumSha256: snapshot.checksumSha256,
      manifest,
      manifestError,
    });
    const hostArchivePath = this.buildHostArchivePath(snapshot.fileName);
    const restoreScope = preflight.files.xrayConfig ? 'FULL' : 'DATABASE_ONLY';
    const panelPublicUrl = this.configService.get('PANEL_PUBLIC_URL', { infer: true });

    return {
      backup: this.serializeBackup(snapshot),
      commands: {
        dryRun: hostArchivePath
          ? `./infra/scripts/restore.sh --dry-run --yes-restore ${this.quoteShellArg(hostArchivePath)}`
          : RESTORE_DRY_RUN_PLACEHOLDER,
        restore: hostArchivePath
          ? `./infra/scripts/restore.sh --yes-restore ${this.quoteShellArg(hostArchivePath)}`
          : RESTORE_COMMAND_PLACEHOLDER,
        verification: [
          {
            id: 'composePs',
            command: 'docker compose ps',
          },
          {
            id: 'apiHealthz',
            command: `curl -sk ${this.quoteShellArg(`${panelPublicUrl}/healthz`)}`,
          },
          {
            id: 'apiReadyz',
            command: `curl -sk ${this.quoteShellArg(`${panelPublicUrl}/readyz`)}`,
          },
          {
            id: 'recentLogs',
            command: 'docker compose logs --tail=100 api xray caddy',
          },
        ],
      },
      guidance: {
        createsSafeguardBackup: true,
        hostPathConfigured: hostArchivePath !== null,
        restoreScope,
      },
      preflight,
    };
  }

  async create(payload: CreateBackupDto, admin: AuthenticatedAdmin, request: Request) {
    return this.createSnapshot({
      notes: payload.notes?.trim() || null,
      summary: 'manual',
      actorAdminId: admin.id,
      ipAddress: request.ip ?? undefined,
      userAgent: request.get('user-agent') ?? undefined,
    });
  }

  async prepareDownload(backupId: string) {
    const snapshot = await this.requireBackup(backupId);
    const archivePath = join(this.backupDir, snapshot.fileName);

    if (snapshot.status !== 'READY' || !existsSync(archivePath)) {
      throw new NotFoundException('Backup archive is not available.');
    }

    return {
      fileName: snapshot.fileName,
      stream: createReadStream(archivePath),
    };
  }

  async remove(backupId: string, admin: AuthenticatedAdmin, request: Request) {
    const snapshot = await this.requireBackup(backupId);

    if (snapshot.status === 'CREATING') {
      throw new BadRequestException('Backup is still being created.');
    }

    const archivePath = join(this.backupDir, snapshot.fileName);
    const existedOnDisk = existsSync(archivePath);

    if (existedOnDisk) {
      await rm(archivePath, {
        force: true,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.backupSnapshot.delete({
        where: {
          id: snapshot.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorAdminId: admin.id,
          action: 'BACKUP_DELETED',
          entityType: 'backup',
          entityId: snapshot.id,
          summary: `Backup ${snapshot.fileName} deleted.`,
          metadata: {
            existedOnDisk,
            fileName: snapshot.fileName,
            status: snapshot.status,
          },
          ipAddress: request.ip ?? undefined,
          userAgent: request.get('user-agent') ?? undefined,
        },
      });
    });

    return {
      success: true,
      id: snapshot.id,
    };
  }

  private async buildArchive(snapshotId: string): Promise<BackupArchiveArtifact> {
    await mkdir(this.backupDir, {
      recursive: true,
    });

    const createdAt = new Date();
    const timestamp = formatBackupTimestamp(createdAt);
    const tempDir = join(this.backupDir, `.tmp-${timestamp}-${randomBytes(4).toString('hex')}`);
    const stageDir = join(tempDir, 'payload');
    const archivePath = join(this.backupDir, `server-vpn-${timestamp}.tar.gz`);

    await mkdir(stageDir, {
      recursive: true,
    });

    try {
      const postgresDumpPath = join(stageDir, 'postgres.sql');
      const xrayConfigPath = join(stageDir, 'xray-config.json');
      const manifestPath = join(stageDir, 'manifest.json');

      await this.createPostgresDump(postgresDumpPath);

      if (existsSync(XRAY_RUNTIME_CONFIG_PATH)) {
        await copyFile(XRAY_RUNTIME_CONFIG_PATH, xrayConfigPath);
      }

      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            backupId: snapshotId,
            createdAt: createdAt.toISOString(),
            schemaVersion: 1,
            services: {
              postgresDump: basename(postgresDumpPath),
              xrayConfig: existsSync(XRAY_RUNTIME_CONFIG_PATH) ? basename(xrayConfigPath) : null,
            },
          },
          null,
          2,
        ),
        'utf8',
      );

      await execFileAsync('tar', ['-czf', archivePath, '-C', stageDir, '.']);
      const checksumSha256 = await this.calculateSha256(archivePath);
      const archiveStats = await stat(archivePath);

      return {
        archivePath,
        checksumSha256,
        fileName: basename(archivePath),
        fileSizeBytes: BigInt(archiveStats.size),
      };
    } finally {
      await rm(tempDir, {
        force: true,
        recursive: true,
      });
    }
  }

  private async createSnapshot(input: {
    actorAdminId?: string;
    ipAddress?: string;
    notes: string | null;
    summary: 'automatic' | 'manual';
    userAgent?: string;
  }) {
    await this.pruneExpiredBackups();

    const placeholderFileName = `pending-${Date.now()}.tar.gz`;
    const snapshot = await this.prisma.backupSnapshot.create({
      data: {
        fileName: placeholderFileName,
        checksumSha256: 'pending',
        fileSizeBytes: 0n,
        status: 'CREATING',
        notes: input.notes,
      },
    });

    try {
      const artifact = await this.buildArchive(snapshot.id);

      const updated = await this.prisma.backupSnapshot.update({
        where: {
          id: snapshot.id,
        },
        data: {
          checksumSha256: artifact.checksumSha256,
          fileName: artifact.fileName,
          fileSizeBytes: artifact.fileSizeBytes,
          status: 'READY',
        },
      });

      await this.auditLogService.write({
        actorAdminId: input.actorAdminId,
        action: 'BACKUP_CREATED',
        entityType: 'backup',
        entityId: updated.id,
        summary:
          input.summary === 'automatic'
            ? `Automatic backup ${updated.fileName} created by scheduler.`
            : `Backup ${updated.fileName} created.`,
        metadata: {
          checksumSha256: artifact.checksumSha256,
          fileSizeBytes: artifact.fileSizeBytes.toString(),
          trigger: input.summary,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });

      return this.serializeBackup(updated);
    } catch (error) {
      await this.prisma.backupSnapshot.update({
        where: {
          id: snapshot.id,
        },
        data: {
          status: 'FAILED',
          notes: input.notes ? `${input.notes}\nCreation failed.` : 'Creation failed.',
        },
      });

      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Backup creation failed.',
      );
    }
  }

  private async createPostgresDump(outputPath: string) {
    const databaseUrl = new URL(this.configService.get('DATABASE_URL', { infer: true }));
    const username = decodeURIComponent(databaseUrl.username);
    const password = decodeURIComponent(databaseUrl.password);
    const databaseName = databaseUrl.pathname.replace(/^\//, '');

    await execFileAsync(
      'pg_dump',
      [
        '--clean',
        '--dbname',
        databaseName,
        '--file',
        outputPath,
        '--format',
        'plain',
        '--host',
        databaseUrl.hostname,
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--port',
        databaseUrl.port || '5432',
        '--username',
        username,
      ],
      {
        env: {
          ...process.env,
          PGPASSWORD: password,
        },
      },
    );
  }

  private async calculateSha256(filePath: string) {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk) => {
        hash.update(chunk);
      });
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });

    return hash.digest('hex');
  }

  private async listArchiveEntries(archivePath: string) {
    const { stdout } = await execFileAsync('tar', ['-tzf', archivePath], {
      encoding: 'utf8',
    });

    return parseArchiveEntries(String(stdout));
  }

  private async readArchiveEntry(archivePath: string, entryName: string) {
    const { stdout } = await execFileAsync('tar', ['-xOzf', archivePath, entryName], {
      encoding: 'utf8',
    });

    return String(stdout);
  }

  private async pruneExpiredBackups() {
    const cutoff = new Date(Date.now() - this.backupRetentionDays * 86_400_000);
    const staleSnapshots = await this.prisma.backupSnapshot.findMany({
      where: {
        createdAt: {
          lt: cutoff,
        },
        status: {
          in: ['READY', 'FAILED'],
        },
      },
    });

    if (staleSnapshots.length === 0) {
      return;
    }

    await Promise.all(
      staleSnapshots.map(async (snapshot) => {
        const archivePath = join(this.backupDir, snapshot.fileName);

        if (existsSync(archivePath)) {
          await rm(archivePath, {
            force: true,
          });
        }

        await this.prisma.backupSnapshot.update({
          where: {
            id: snapshot.id,
          },
          data: {
            notes: formatPruneNotes(snapshot.notes, new Date()),
            status: 'PRUNED',
          },
        });
      }),
    );

    const extraFiles = await readdir(this.backupDir, {
      withFileTypes: true,
    });

    await Promise.all(
      extraFiles
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('.tmp-'))
        .map((entry) =>
          rm(join(this.backupDir, entry.name), {
            force: true,
            recursive: true,
          }),
        ),
    );
  }

  private async runAutomaticMaintenance(reason: string) {
    if (this.inflightAutomaticMaintenance) {
      return this.inflightAutomaticMaintenance;
    }

    this.inflightAutomaticMaintenance = this.performAutomaticMaintenance(reason).finally(() => {
      this.inflightAutomaticMaintenance = null;
    });

    return this.inflightAutomaticMaintenance;
  }

  private async performAutomaticMaintenance(reason: string) {
    try {
      if (!(await this.shouldCreateAutomaticBackup())) {
        await this.pruneExpiredBackups();
        return;
      }

      await this.createSnapshot({
        notes: `Automatic backup created by scheduler (${reason}).`,
        summary: 'automatic',
      });
    } catch (error) {
      this.logger.warn(
        `Automatic backup maintenance failed: ${error instanceof Error ? error.message : 'Unknown error.'}`,
      );
    }
  }

  private async shouldCreateAutomaticBackup() {
    if (!this.backupAutoCreateEnabled) {
      return false;
    }

    const recentPendingSnapshot = await this.prisma.backupSnapshot.findFirst({
      where: {
        status: 'CREATING',
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
      },
    });

    if (
      recentPendingSnapshot &&
      Date.now() - recentPendingSnapshot.createdAt.getTime() < this.backupAutoMaintenanceIntervalMs
    ) {
      return false;
    }

    const latestSuccessfulSnapshot = await this.prisma.backupSnapshot.findFirst({
      where: {
        status: {
          in: ['PRUNED', 'READY', 'RESTORED'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
      },
    });

    return isAutomaticBackupDue({
      intervalDays: this.backupAutoCreateIntervalDays,
      latestSuccessfulBackupCreatedAt: latestSuccessfulSnapshot?.createdAt ?? null,
      now: new Date(),
    });
  }

  private async requireBackup(backupId: string) {
    const snapshot = await this.prisma.backupSnapshot.findUnique({
      where: {
        id: backupId,
      },
    });

    if (!snapshot) {
      throw new NotFoundException('Backup snapshot was not found.');
    }

    return snapshot;
  }

  private serializeBackup(snapshot: {
    checksumSha256: string;
    createdAt: Date;
    fileName: string;
    fileSizeBytes: bigint;
    id: string;
    notes: string | null;
    restoredAt: Date | null;
    status: string;
  }) {
    const containerArchivePath = this.buildContainerArchivePath(snapshot.fileName);
    const hostArchivePath = this.buildHostArchivePath(snapshot.fileName);

    return {
      id: snapshot.id,
      fileName: snapshot.fileName,
      absolutePath: hostArchivePath ?? containerArchivePath,
      containerAbsolutePath: containerArchivePath,
      hostAbsolutePath: hostArchivePath,
      checksumSha256: snapshot.checksumSha256,
      fileSizeBytes: snapshot.fileSizeBytes.toString(),
      status: snapshot.status,
      createdAt: snapshot.createdAt.toISOString(),
      restoredAt: snapshot.restoredAt?.toISOString() ?? null,
      notes: snapshot.notes,
      exists: existsSync(containerArchivePath),
    };
  }

  private get backupDir() {
    return this.configService.get('BACKUP_DIR', { infer: true });
  }

  private get backupHostDir() {
    const value = this.configService.get('BACKUP_HOST_DIR', { infer: true }).trim();

    return value.length > 0 ? value : null;
  }

  private get backupAutoCreateEnabled() {
    return this.configService.get('BACKUP_AUTO_CREATE_ENABLED', { infer: true });
  }

  private get backupAutoCreateIntervalDays() {
    return this.configService.get('BACKUP_AUTO_CREATE_INTERVAL_DAYS', { infer: true });
  }

  private get backupAutoMaintenanceIntervalMs() {
    return this.configService.get('BACKUP_AUTO_MAINTENANCE_INTERVAL_MS', { infer: true });
  }

  private get backupRetentionDays() {
    return this.configService.get('BACKUP_RETENTION_DAYS', { infer: true });
  }

  private quoteShellArg(value: string) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  private buildContainerArchivePath(fileName: string) {
    return join(this.backupDir, fileName);
  }

  private buildHostArchivePath(fileName: string) {
    return this.backupHostDir ? join(this.backupHostDir, fileName) : null;
  }
}
