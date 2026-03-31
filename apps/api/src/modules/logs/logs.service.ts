import { existsSync } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppEnv } from '../../common/config/env.schema';

type LogSource = {
  id: string;
  label: string;
  path: string;
};

async function readTailLines(filePath: string, maxLines: number): Promise<string> {
  const file = await open(filePath, 'r');

  try {
    const stats = await file.stat();
    const linesWanted = Math.min(Math.max(maxLines, 50), 2_000);
    const maxBytes = 8 * 1024 * 1024;
    const readWindow = Math.min(stats.size, maxBytes);

    if (readWindow <= 0) {
      return '';
    }

    const start = Math.max(0, stats.size - readWindow);
    const buffer = Buffer.alloc(readWindow);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, start);

    const source = buffer.subarray(0, bytesRead).toString('utf8');

    if (!source.length) {
      return '';
    }

    return source
      .split(/\r?\n/)
      .slice(-linesWanted)
      .join('\n')
      .trim();
  } finally {
    await file.close();
  }
}

@Injectable()
export class LogsService {
  constructor(private readonly configService: ConfigService<AppEnv, true>) {}

  listSources() {
    return {
      items: this.getSources().map((source) => ({
        ...source,
        available: existsSync(source.path),
      })),
    };
  }

  async readSource(sourceId: string, lines = 200) {
    const source = this.getSources().find((item) => item.id === sourceId);

    if (!source) {
      throw new NotFoundException('Log source was not found.');
    }

    if (!existsSync(source.path)) {
      return {
        content: '',
        exists: false,
        label: source.label,
        path: source.path,
        sourceId,
      };
    }

    const [content, stats] = await Promise.all([
      readTailLines(source.path, Math.min(Math.max(lines, 50), 2_000)),
      stat(source.path),
    ]);

    return {
      content,
      exists: true,
      label: source.label,
      path: source.path,
      sizeBytes: stats.size,
      sourceId,
      updatedAt: stats.mtime.toISOString(),
    };
  }

  private getSources(): LogSource[] {
    return [
      {
        id: 'api',
        label: 'API application log',
        path: this.configService.get('API_LOG_FILE', { infer: true }),
      },
      {
        id: 'xray-error',
        label: 'Xray error log',
        path: this.configService.get('XRAY_ERROR_LOG_FILE', { infer: true }),
      },
      {
        id: 'xray-access',
        label: 'Xray access log',
        path: this.configService.get('XRAY_ACCESS_LOG_FILE', { infer: true }),
      },
      {
        id: 'caddy-access',
        label: 'Caddy access log',
        path: this.configService.get('CADDY_ACCESS_LOG_FILE', { infer: true }),
      },
    ];
  }
}
