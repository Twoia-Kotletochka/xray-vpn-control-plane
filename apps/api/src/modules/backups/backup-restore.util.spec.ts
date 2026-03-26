import { describe, expect, it } from 'vitest';

import {
  buildBackupRestorePreflight,
  findArchiveEntry,
  parseArchiveEntries,
  parseBackupManifest,
} from './backup-restore.util';

describe('parseArchiveEntries', () => {
  it('drops empty lines and the root tar entry', () => {
    expect(parseArchiveEntries('./\n./manifest.json\n./postgres.sql\n')).toEqual([
      './manifest.json',
      './postgres.sql',
    ]);
  });
});

describe('findArchiveEntry', () => {
  it('matches entries regardless of leading dot-slash', () => {
    expect(findArchiveEntry(['./manifest.json', './postgres.sql'], 'manifest.json')).toBe(
      './manifest.json',
    );
  });
});

describe('parseBackupManifest', () => {
  it('parses a valid manifest', () => {
    expect(
      parseBackupManifest(
        JSON.stringify({
          backupId: 'backup-1',
          createdAt: '2026-03-24T18:00:00.000Z',
          schemaVersion: 1,
          services: {
            postgresDump: 'postgres.sql',
            xrayConfig: 'xray-config.json',
          },
        }),
      ),
    ).toEqual({
      backupId: 'backup-1',
      createdAt: '2026-03-24T18:00:00.000Z',
      schemaVersion: 1,
      services: {
        postgresDump: 'postgres.sql',
        xrayConfig: 'xray-config.json',
      },
    });
  });

  it('throws on an invalid manifest', () => {
    expect(() => parseBackupManifest('{"backupId":""}')).toThrowError(
      /Backup manifest is missing backupId/,
    );
  });
});

describe('buildBackupRestorePreflight', () => {
  it('accepts a complete archive with matching checksum', () => {
    const preflight = buildBackupRestorePreflight({
      actualChecksumSha256: 'abc',
      archiveEntries: ['./manifest.json', './postgres.sql', './xray-config.json'],
      expectedChecksumSha256: 'abc',
      manifest: {
        backupId: 'backup-1',
        createdAt: '2026-03-24T18:00:00.000Z',
        schemaVersion: 1,
        services: {
          postgresDump: 'postgres.sql',
          xrayConfig: 'xray-config.json',
        },
      },
      manifestError: null,
    });

    expect(preflight.canRestore).toBe(true);
    expect(preflight.warnings).toEqual([]);
  });

  it('reports destructive risks for an incomplete archive', () => {
    const preflight = buildBackupRestorePreflight({
      actualChecksumSha256: 'actual',
      archiveEntries: ['./postgres.sql'],
      expectedChecksumSha256: 'expected',
      manifest: null,
      manifestError: 'Manifest could not be parsed.',
    });

    expect(preflight.canRestore).toBe(false);
    expect(preflight.files.manifest).toBe(false);
    expect(preflight.files.xrayConfig).toBe(false);
    expect(preflight.warnings).toContain(
      'SHA-256 архива не совпадает с сохранённым значением. Restore нужно остановить.',
    );
    expect(preflight.warnings).toContain('Manifest could not be parsed.');
  });
});
