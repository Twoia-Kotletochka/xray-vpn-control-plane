import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import type { BackupListResponse, BackupRecord } from '../../lib/api-types';
import { formatBytes, formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

function formatBackupStatus(status: string) {
  switch (status) {
    case 'READY':
      return 'Готов';
    case 'CREATING':
      return 'Создаётся';
    case 'FAILED':
      return 'Ошибка';
    case 'PRUNED':
      return 'Удалён по retention';
    case 'RESTORED':
      return 'Восстановлен';
    default:
      return status;
  }
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BackupsPage() {
  const { apiFetch, apiFetchResponse } = useAuth();
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [backupDir, setBackupDir] = useState('');
  const [retentionDays, setRetentionDays] = useState(0);
  const [restoreCommand, setRestoreCommand] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDownloadingId, setIsDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch<BackupListResponse>('/api/backups');

      setBackups(response.items);
      setBackupDir(response.policy.backupDir);
      setRetentionDays(response.policy.retentionDays);
      setRestoreCommand(response.policy.restoreCommand);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Не удалось загрузить список резервных копий.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const handleCreateBackup = async () => {
    setIsCreating(true);
    setError(null);

    try {
      await apiFetch('/api/backups', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      await loadBackups();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'Не удалось создать резервную копию.',
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleDownload = async (backup: BackupRecord) => {
    setIsDownloadingId(backup.id);
    setError(null);

    try {
      const response = await apiFetchResponse(`/api/backups/${backup.id}/download`);
      const blob = await response.blob();
      downloadBlob(backup.fileName, blob);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Не удалось скачать резервную копию.',
      );
    } finally {
      setIsDownloadingId(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Резервные копии"
        description="Снимки PostgreSQL и отрендеренного Xray-конфига доступны прямо из панели. Восстановление остаётся осознанной операцией через host-скрипт, чтобы не ломать control plane изнутри самого приложения."
        actionLabel={isCreating ? 'Создаём backup...' : 'Создать backup'}
        actionDisabled={isCreating}
        onAction={() => void handleCreateBackup()}
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <div className="content-grid">
        <SectionCard
          title="Политика хранения"
          subtitle="Настройки берутся из боевого .env и соблюдаются автоматически при создании новых архивов."
        >
          <div className="stat-grid">
            <div className="stat-card">
              <span>Каталог архивов</span>
              <strong>{backupDir || '—'}</strong>
            </div>
            <div className="stat-card">
              <span>Retention</span>
              <strong>{retentionDays > 0 ? `${retentionDays} дн.` : '—'}</strong>
            </div>
          </div>

          <div className="feature-list">
            <div className="feature-list__card">
              <strong>Как восстанавливать</strong>
              <code>
                {restoreCommand ||
                  './infra/scripts/restore.sh --yes-restore /absolute/path/to/archive.tar.gz'}
              </code>
            </div>
            <div className="feature-list__card">
              <strong>Почему без кнопки restore</strong>
              <span>
                Восстановление из UI опасно для single-node control plane: приложение не должно само
                пересобирать собственную базу и runtime, пока на нём держится сессия администратора.
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Операционный контур"
          subtitle="Архив включает дамп PostgreSQL, Xray config и manifest с датой создания."
        >
          <ul className="feature-list">
            <li>
              Архивы создаются внутри контейнера API через `pg_dump`, без доступа приложения к
              `docker.sock`.
            </li>
            <li>
              В Xray попадает только отрендеренный runtime config, без приватных секретов в git.
            </li>
            <li>
              Старые архивы автоматически помечаются как `PRUNED` и удаляются по retention policy.
            </li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        title="История backup"
        subtitle="Свежие архивы можно скачать из панели и хранить во внешнем cold storage."
      >
        <div className="toolbar">
          <div className="toolbar__actions">
            <button
              className="button"
              type="button"
              onClick={() => void loadBackups()}
              disabled={isLoading}
            >
              <RefreshCw size={16} />
              Обновить список
            </button>
          </div>
          <div className="topbar__chip">
            <ShieldCheck size={16} />
            Архивы: {backups.length}
          </div>
        </div>

        <div className="backup-grid">
          {backups.map((backup) => (
            <article key={backup.id} className="backup-card">
              <div className="backup-card__header">
                <div>
                  <strong>{backup.fileName}</strong>
                  <span>{formatBackupStatus(backup.status)}</span>
                </div>
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleDownload(backup)}
                  disabled={
                    !backup.exists || backup.status !== 'READY' || isDownloadingId === backup.id
                  }
                >
                  <Download size={16} />
                  {isDownloadingId === backup.id ? 'Скачиваем...' : 'Скачать'}
                </button>
              </div>

              <dl className="detail-list">
                <div>
                  <dt>Создан</dt>
                  <dd>{formatDateTime(backup.createdAt)}</dd>
                </div>
                <div>
                  <dt>Размер</dt>
                  <dd>{formatBytes(Number(backup.fileSizeBytes))}</dd>
                </div>
                <div>
                  <dt>SHA-256</dt>
                  <dd className="detail-list__mono">{backup.checksumSha256}</dd>
                </div>
                <div>
                  <dt>Файл на диске</dt>
                  <dd>{backup.exists ? 'Доступен' : 'Недоступен'}</dd>
                </div>
              </dl>

              {backup.notes ? <div className="backup-card__notes">{backup.notes}</div> : null}
            </article>
          ))}

          {!isLoading && backups.length === 0 ? (
            <div className="empty-state">
              Архивов пока нет. Создайте первый backup перед обновлениями или миграциями.
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
