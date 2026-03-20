import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppEnv } from '../../common/config/env.schema';

type LogSource = {
  id: string;
  label: string;
  path: string;
};

function tailLines(content: string, maxLines: number) {
  const lines = content.split(/\r?\n/);
  return lines
    .slice(Math.max(0, lines.length - maxLines))
    .join('\n')
    .trim();
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

    const [content, stats] = await Promise.all([readFile(source.path, 'utf8'), stat(source.path)]);

    return {
      content: tailLines(content, Math.min(Math.max(lines, 50), 2_000)),
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
