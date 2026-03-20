import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin.interface';
import type { AppEnv } from '../../common/config/env.schema';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { CreateBackupDto } from './dto/create-backup.dto';

const execFileAsync = promisify(execFile);
const XRAY_RUNTIME_CONFIG_PATH = '/var/lib/server-vpn/xray/config.json';

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
export class BackupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppEnv, true>,
    private readonly auditLogService: AuditLogService,
  ) {}

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
        retentionDays: this.backupRetentionDays,
        restoreCommand: './infra/scripts/restore.sh --yes-restore /absolute/path/to/archive.tar.gz',
      },
    };
  }

  async create(payload: CreateBackupDto, admin: AuthenticatedAdmin, request: Request) {
    await this.pruneExpiredBackups();

    const placeholderFileName = `pending-${Date.now()}.tar.gz`;
    const snapshot = await this.prisma.backupSnapshot.create({
      data: {
        fileName: placeholderFileName,
        checksumSha256: 'pending',
        fileSizeBytes: 0n,
        status: 'CREATING',
        notes: payload.notes?.trim() || null,
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
        actorAdminId: admin.id,
        action: 'BACKUP_CREATED',
        entityType: 'backup',
        entityId: updated.id,
        summary: `Backup ${updated.fileName} created.`,
        metadata: {
          checksumSha256: artifact.checksumSha256,
          fileSizeBytes: artifact.fileSizeBytes.toString(),
        },
        ipAddress: request.ip ?? undefined,
        userAgent: request.get('user-agent') ?? undefined,
      });

      return this.serializeBackup(updated);
    } catch (error) {
      await this.prisma.backupSnapshot.update({
        where: {
          id: snapshot.id,
        },
        data: {
          status: 'FAILED',
          notes: payload.notes?.trim()
            ? `${payload.notes.trim()}\nCreation failed.`
            : 'Creation failed.',
        },
      });

      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Backup creation failed.',
      );
    }
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
    const archivePath = join(this.backupDir, snapshot.fileName);

    return {
      id: snapshot.id,
      fileName: snapshot.fileName,
      checksumSha256: snapshot.checksumSha256,
      fileSizeBytes: snapshot.fileSizeBytes.toString(),
      status: snapshot.status,
      createdAt: snapshot.createdAt.toISOString(),
      restoredAt: snapshot.restoredAt?.toISOString() ?? null,
      notes: snapshot.notes,
      exists: existsSync(archivePath),
    };
  }

  private get backupDir() {
    return this.configService.get('BACKUP_DIR', { infer: true });
  }

  private get backupRetentionDays() {
    return this.configService.get('BACKUP_RETENTION_DAYS', { infer: true });
  }
}
