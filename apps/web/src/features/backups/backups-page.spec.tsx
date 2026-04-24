// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BackupListResponse, BackupRestorePlanResponse } from '../../lib/api-types';
import { BackupsPage } from './backups-page';

const mockApiFetch = vi.fn();
const mockApiFetchResponse = vi.fn();

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    apiFetch: mockApiFetch,
    apiFetchResponse: mockApiFetchResponse,
  }),
}));

describe('BackupsPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetchResponse.mockReset();
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(),
      },
    });
  });

  it('loads a restore plan before showing the restore commands', async () => {
    const backupRecord = {
      id: 'backup-1',
      fileName: 'server-vpn-20260324-184000Z.tar.gz',
      absolutePath: '/opt/server-vpn/infra/backup/output/server-vpn-20260324-184000Z.tar.gz',
      containerAbsolutePath: '/var/backups/server-vpn/server-vpn-20260324-184000Z.tar.gz',
      hostAbsolutePath: '/opt/server-vpn/infra/backup/output/server-vpn-20260324-184000Z.tar.gz',
      checksumSha256: 'abc',
      fileSizeBytes: '1024',
      status: 'READY',
      createdAt: '2026-03-24T18:40:00.000Z',
      restoredAt: null,
      notes: null,
      exists: true,
    } satisfies BackupListResponse['items'][number];
    const listResponse: BackupListResponse = {
      items: [backupRecord],
      policy: {
        backupDir: '/var/backups/server-vpn',
        hostBackupDir: '/opt/server-vpn/infra/backup/output',
        autoCreateEnabled: true,
        autoCreateIntervalDays: 5,
        retentionDays: 14,
        restoreDryRunCommand:
          './infra/scripts/restore.sh --dry-run --yes-restore /absolute/path/to/archive.tar.gz',
        restoreCommand: './infra/scripts/restore.sh --yes-restore /absolute/path/to/archive.tar.gz',
      },
    };
    const restorePlan: BackupRestorePlanResponse = {
      backup: backupRecord,
      commands: {
        dryRun:
          "./infra/scripts/restore.sh --dry-run --yes-restore '/var/backups/server-vpn/server-vpn-20260324-184000Z.tar.gz'",
        restore:
          "./infra/scripts/restore.sh --yes-restore '/opt/server-vpn/infra/backup/output/server-vpn-20260324-184000Z.tar.gz'",
        verification: [
          {
            id: 'composePs',
            command: 'docker compose ps',
          },
          {
            id: 'apiHealthz',
            command: "curl -sk 'https://panel.example.com/healthz'",
          },
          {
            id: 'apiReadyz',
            command: "curl -sk 'https://panel.example.com/readyz'",
          },
          {
            id: 'recentLogs',
            command: 'docker compose logs --tail=100 api xray caddy',
          },
        ],
      },
      guidance: {
        createsSafeguardBackup: true,
        hostPathConfigured: true,
        restoreScope: 'FULL',
      },
      preflight: {
        canRestore: true,
        checksum: {
          actualSha256: 'abc',
          expectedSha256: 'abc',
          matches: true,
        },
        files: {
          manifest: true,
          postgresDump: true,
          xrayConfig: true,
        },
        manifest: {
          backupId: 'backup-1',
          createdAt: '2026-03-24T18:40:00.000Z',
          postgresDump: 'postgres.sql',
          schemaVersion: 1,
          valid: true,
          xrayConfig: 'xray-config.json',
        },
        warnings: [],
      },
    };

    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/backups') {
        return listResponse;
      }

      if (path === '/api/backups/backup-1/restore-plan') {
        return restorePlan;
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(<BackupsPage />);

    await screen.findByText('server-vpn-20260324-184000Z.tar.gz');

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await screen.findByText(/Preflight пройден/i);
    expect(screen.getByText(/Автоматический safeguard backup/i)).toBeTruthy();
    expect(
      screen.getByText(
        "./infra/scripts/restore.sh --dry-run --yes-restore '/opt/server-vpn/infra/backup/output/server-vpn-20260324-184000Z.tar.gz'",
      ),
    ).toBeTruthy();
    const restoreCopyButton = screen.getByRole('button', { name: 'Скопировать restore' });
    expect((restoreCopyButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/Сначала выполню и проверю dry-run/i));
    fireEvent.click(screen.getByLabelText(/есть свежий внешний backup/i));
    fireEvent.click(screen.getByLabelText(/окно обслуживания/i));

    expect((restoreCopyButton as HTMLButtonElement).disabled).toBe(false);
  });
});
