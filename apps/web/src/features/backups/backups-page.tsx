import { Copy, Download, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Modal } from '../../components/ui/modal';
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

function quoteShellArg(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);

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
    setNotice(null);

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
    setNotice(null);

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

  const handleDelete = async (backup: BackupRecord) => {
    if (
      !window.confirm(
        `Удалить backup ${backup.fileName}? Архив на диске и запись в панели будут удалены.`,
      )
    ) {
      return;
    }

    setIsDeletingId(backup.id);
    setError(null);
    setNotice(null);

    try {
      await apiFetch<{ id: string; success: boolean }>(`/api/backups/${backup.id}`, {
        method: 'DELETE',
      });

      setNotice(`Backup ${backup.fileName} удалён.`);

      if (restoreTarget?.id === backup.id) {
        setRestoreTarget(null);
      }

      await loadBackups();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Не удалось удалить резервную копию.',
      );
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleCopyRestoreCommand = async (backup: BackupRecord) => {
    const command = `./infra/scripts/restore.sh --yes-restore ${quoteShellArg(backup.absolutePath)}`;
    await navigator.clipboard.writeText(command);
    setNotice(`Команда восстановления для ${backup.fileName} скопирована.`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Резервные копии"
        description="Управление архивами PostgreSQL и runtime-конфигом Xray с безопасным recovery workflow."
        actionLabel={isCreating ? 'Создаём backup...' : 'Создать backup'}
        actionDisabled={isCreating}
        onAction={() => void handleCreateBackup()}
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}
      {notice ? <div className="banner banner--success">{notice}</div> : null}

      <div className="content-grid">
        <SectionCard
          title="Политика хранения"
          subtitle="Параметры берутся из production-конфига и соблюдаются автоматически при создании новых архивов."
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
              <strong>Restore workflow</strong>
              <span>
                Восстановление выполняется с хоста по подтверждённой команде. Панель подсказывает
                точный порядок действий и конкретный архив, но не запускает destructive recovery
                из активной админской сессии.
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Операционный контур"
          subtitle="Архив включает дамп PostgreSQL, runtime-конфиг Xray и manifest с датой создания."
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
        subtitle="Архив можно скачать, удалить или использовать как основу для host-side восстановления."
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
                <div className="backup-card__actions">
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
                  <button
                    className="button"
                    type="button"
                    onClick={() => setRestoreTarget(backup)}
                    disabled={!backup.exists || backup.status !== 'READY'}
                  >
                    <RotateCcw size={16} />
                    Restore
                  </button>
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={() => void handleDelete(backup)}
                    disabled={isDeletingId === backup.id}
                  >
                    <Trash2 size={16} />
                    {isDeletingId === backup.id ? 'Удаляем...' : 'Удалить'}
                  </button>
                </div>
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

      <Modal
        isOpen={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        title={restoreTarget ? `Восстановление: ${restoreTarget.fileName}` : 'Восстановление backup'}
      >
        {restoreTarget ? (
          <div className="detail-stack">
            <div className="banner banner--danger">
              Recovery нужно запускать только с хоста и только после подтверждения, что текущая
              база и runtime могут быть перезаписаны.
            </div>

            <div className="feature-list">
              <div className="feature-list__card">
                <strong>Архив</strong>
                <code>{restoreTarget.absolutePath}</code>
              </div>
              <div className="feature-list__card">
                <strong>Команда</strong>
                <code>
                  {`./infra/scripts/restore.sh --yes-restore ${quoteShellArg(restoreTarget.absolutePath)}`}
                </code>
              </div>
            </div>

            <ul className="feature-list">
              <li>Скачайте свежий архив во внешнее хранилище перед восстановлением.</li>
              <li>Убедитесь, что окно обслуживания согласовано и активные изменения остановлены.</li>
              <li>Запускайте restore только на хосте, а не из контейнера приложения.</li>
            </ul>

            <div className="toolbar__actions wrap-actions">
              <button
                className="button"
                type="button"
                onClick={() => void handleCopyRestoreCommand(restoreTarget)}
              >
                <Copy size={16} />
                Скопировать команду
              </button>
              <button className="button" type="button" onClick={() => setRestoreTarget(null)}>
                Закрыть
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
