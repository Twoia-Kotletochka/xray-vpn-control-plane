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
    const listResponse: BackupListResponse = {
      items: [
        {
          id: 'backup-1',
          fileName: 'server-vpn-20260324-184000Z.tar.gz',
          absolutePath: '/var/backups/server-vpn/server-vpn-20260324-184000Z.tar.gz',
          checksumSha256: 'abc',
          fileSizeBytes: '1024',
          status: 'READY',
          createdAt: '2026-03-24T18:40:00.000Z',
          restoredAt: null,
          notes: null,
          exists: true,
        },
      ],
      policy: {
        backupDir: '/var/backups/server-vpn',
        retentionDays: 14,
        restoreDryRunCommand:
          './infra/scripts/restore.sh --dry-run --yes-restore /absolute/path/to/archive.tar.gz',
        restoreCommand: './infra/scripts/restore.sh --yes-restore /absolute/path/to/archive.tar.gz',
      },
    };
    const restorePlan: BackupRestorePlanResponse = {
      backup: listResponse.items[0],
      commands: {
        dryRun:
          "./infra/scripts/restore.sh --dry-run --yes-restore '/var/backups/server-vpn/server-vpn-20260324-184000Z.tar.gz'",
        restore:
          "./infra/scripts/restore.sh --yes-restore '/var/backups/server-vpn/server-vpn-20260324-184000Z.tar.gz'",
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
    expect(screen.getByText(/--dry-run --yes-restore/)).toBeTruthy();
    expect(screen.getByText(/Schema version/i)).toBeTruthy();
  });
});
