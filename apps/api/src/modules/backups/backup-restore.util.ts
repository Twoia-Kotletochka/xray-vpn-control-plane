type BackupManifestServices = {
  postgresDump: string;
  xrayConfig: string | null;
};

export type BackupArchiveManifest = {
  backupId: string;
  createdAt: string;
  schemaVersion: number;
  services: BackupManifestServices;
};

export type BackupRestorePreflight = {
  canRestore: boolean;
  checksum: {
    actualSha256: string;
    expectedSha256: string;
    matches: boolean;
  };
  files: {
    manifest: boolean;
    postgresDump: boolean;
    xrayConfig: boolean;
  };
  manifest: {
    backupId: string | null;
    createdAt: string | null;
    postgresDump: string | null;
    schemaVersion: number | null;
    valid: boolean;
    xrayConfig: string | null;
  };
  warnings: string[];
};

type BuildBackupRestorePreflightParams = {
  actualChecksumSha256: string;
  archiveEntries: string[];
  expectedChecksumSha256: string;
  manifest: BackupArchiveManifest | null;
  manifestError: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeArchiveEntry(entry: string) {
  return entry.replace(/^\.\//, '').replace(/\/$/, '');
}

export function parseArchiveEntries(output: string) {
  return output
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry !== './');
}

export function findArchiveEntry(entries: string[], targetPath: string) {
  const normalizedTarget = normalizeArchiveEntry(targetPath);

  return entries.find((entry) => normalizeArchiveEntry(entry) === normalizedTarget) ?? null;
}

export function parseBackupManifest(rawManifest: string): BackupArchiveManifest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawManifest);
  } catch {
    throw new Error('Backup manifest is not valid JSON.');
  }

  if (!isRecord(parsed)) {
    throw new Error('Backup manifest must be a JSON object.');
  }

  if (typeof parsed.backupId !== 'string' || parsed.backupId.length === 0) {
    throw new Error('Backup manifest is missing backupId.');
  }

  if (typeof parsed.createdAt !== 'string' || parsed.createdAt.length === 0) {
    throw new Error('Backup manifest is missing createdAt.');
  }

  if (typeof parsed.schemaVersion !== 'number' || !Number.isInteger(parsed.schemaVersion)) {
    throw new Error('Backup manifest has an invalid schemaVersion.');
  }

  if (!isRecord(parsed.services)) {
    throw new Error('Backup manifest is missing services.');
  }

  if (
    typeof parsed.services.postgresDump !== 'string' ||
    parsed.services.postgresDump.length === 0
  ) {
    throw new Error('Backup manifest is missing postgresDump reference.');
  }

  if (
    parsed.services.xrayConfig !== null &&
    (typeof parsed.services.xrayConfig !== 'string' || parsed.services.xrayConfig.length === 0)
  ) {
    throw new Error('Backup manifest has an invalid xrayConfig reference.');
  }

  return {
    backupId: parsed.backupId,
    createdAt: parsed.createdAt,
    schemaVersion: parsed.schemaVersion,
    services: {
      postgresDump: parsed.services.postgresDump,
      xrayConfig: parsed.services.xrayConfig ?? null,
    },
  };
}

export function buildBackupRestorePreflight({
  actualChecksumSha256,
  archiveEntries,
  expectedChecksumSha256,
  manifest,
  manifestError,
}: BuildBackupRestorePreflightParams): BackupRestorePreflight {
  const warnings: string[] = [];
  const manifestEntry = findArchiveEntry(archiveEntries, 'manifest.json');
  const postgresEntry = findArchiveEntry(
    archiveEntries,
    manifest?.services.postgresDump ?? 'postgres.sql',
  );
  const xrayConfigEntry = findArchiveEntry(
    archiveEntries,
    manifest?.services.xrayConfig ?? 'xray-config.json',
  );
  const checksumMatches = actualChecksumSha256 === expectedChecksumSha256;

  if (!checksumMatches) {
    warnings.push('SHA-256 архива не совпадает с сохранённым значением. Restore нужно остановить.');
  }

  if (!manifestEntry) {
    warnings.push('В архиве отсутствует manifest.json.');
  }

  if (manifestError) {
    warnings.push(manifestError);
  }

  if (!postgresEntry) {
    warnings.push('В архиве отсутствует postgres.sql.');
  }

  if (manifest && manifest.schemaVersion !== 1) {
    warnings.push(
      `Schema version ${manifest.schemaVersion} не поддерживается текущим restore workflow.`,
    );
  }

  if (manifest?.services.postgresDump && !postgresEntry) {
    warnings.push(
      `Файл дампа ${manifest.services.postgresDump} указан в manifest, но отсутствует в архиве.`,
    );
  }

  if (manifest?.services.xrayConfig && !xrayConfigEntry) {
    warnings.push(
      `Файл runtime-конфига ${manifest.services.xrayConfig} указан в manifest, но отсутствует в архиве.`,
    );
  }

  if (!xrayConfigEntry) {
    warnings.push(
      'В архиве нет runtime-конфига Xray. Возможен только DB-focused restore без перезаписи текущего config.json.',
    );
  }

  return {
    canRestore:
      checksumMatches &&
      manifest !== null &&
      manifest.schemaVersion === 1 &&
      postgresEntry !== null &&
      manifestEntry !== null,
    checksum: {
      actualSha256: actualChecksumSha256,
      expectedSha256: expectedChecksumSha256,
      matches: checksumMatches,
    },
    files: {
      manifest: manifestEntry !== null,
      postgresDump: postgresEntry !== null,
      xrayConfig: xrayConfigEntry !== null,
    },
    manifest: {
      backupId: manifest?.backupId ?? null,
      createdAt: manifest?.createdAt ?? null,
      postgresDump: manifest?.services.postgresDump ?? null,
      schemaVersion: manifest?.schemaVersion ?? null,
      valid: manifest !== null && manifestError === null,
      xrayConfig: manifest?.services.xrayConfig ?? null,
    },
    warnings,
  };
}
