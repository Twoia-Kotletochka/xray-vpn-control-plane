import { Copy, Download, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Modal } from '../../components/ui/modal';
import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { useI18n } from '../../i18n';
import type {
  BackupListResponse,
  BackupRecord,
  BackupRestorePlanResponse,
} from '../../lib/api-types';
import { formatBytes, formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

function formatBackupStatus(status: string, locale: 'ru' | 'en') {
  switch (status) {
    case 'READY':
      return locale === 'en' ? 'Ready' : 'Готов';
    case 'CREATING':
      return locale === 'en' ? 'Creating' : 'Создаётся';
    case 'FAILED':
      return locale === 'en' ? 'Failed' : 'Ошибка';
    case 'PRUNED':
      return locale === 'en' ? 'Pruned by retention' : 'Удалён по retention';
    case 'RESTORED':
      return locale === 'en' ? 'Restored' : 'Восстановлен';
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
  const { admin, apiFetch, apiFetchResponse } = useAuth();
  const { locale, ui } = useI18n();
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [backupDir, setBackupDir] = useState('');
  const [hostBackupDir, setHostBackupDir] = useState<string | null>(null);
  const [autoCreateEnabled, setAutoCreateEnabled] = useState(false);
  const [autoCreateIntervalDays, setAutoCreateIntervalDays] = useState(0);
  const [retentionDays, setRetentionDays] = useState(0);
  const [restoreDryRunCommand, setRestoreDryRunCommand] = useState('');
  const [restoreCommand, setRestoreCommand] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDownloadingId, setIsDownloadingId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isRestorePlanLoading, setIsRestorePlanLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [restorePlan, setRestorePlan] = useState<BackupRestorePlanResponse | null>(null);
  const [hasConfirmedDryRun, setHasConfirmedDryRun] = useState(false);
  const [hasConfirmedExternalBackup, setHasConfirmedExternalBackup] = useState(false);
  const [hasConfirmedMaintenanceWindow, setHasConfirmedMaintenanceWindow] = useState(false);
  const isReadOnly = admin?.role === 'READ_ONLY';
  const text =
    locale === 'en'
      ? {
          loadError: 'Failed to load backups.',
          restorePlanError: 'Failed to prepare the restore plan.',
          createError: 'Failed to create the backup.',
          downloadError: 'Failed to download the backup.',
          deleteConfirm: (fileName: string) =>
            `Delete backup ${fileName}? The archive on disk and the panel record will both be removed.`,
          deleteNotice: (fileName: string) => `Backup ${fileName} was deleted.`,
          deleteError: 'Failed to delete the backup.',
          copyNotice: (label: string, fileName: string) => `${label} for ${fileName} was copied.`,
          description:
            'Manage PostgreSQL archives and the Xray runtime config with a safe recovery workflow.',
          createAction: 'Create backup',
          creatingAction: 'Creating backup...',
          policyTitle: 'Retention policy',
          policySubtitle:
            'These parameters come from the production config and are enforced automatically when new archives are created.',
          archiveDirectory: 'Archive directory',
          hostArchiveDirectory: 'Host archive directory',
          autoBackup: 'Auto-backup',
          everyDays: (days: number) => `Every ${days} days`,
          disabled: 'Disabled',
          retention: 'Retention',
          daysShort: (days: number) => `${days} days`,
          dryRunBeforeRestore: 'Dry-run before restore',
          restoreCommand: 'Restore command',
          restoreWorkflow: 'Restore workflow',
          restoreWorkflowText:
            'Restore is executed from the host with an explicit command. The panel shows the exact flow and archive, but does not run destructive recovery from an active admin session.',
          operationsTitle: 'Operations contour',
          operationsSubtitle:
            'Each archive includes a PostgreSQL dump, the Xray runtime config, and a manifest with the creation date.',
          operationsItems: [
            'Archives are created inside the API container via pg_dump, without giving the app access to docker.sock.',
            'Only the rendered runtime config goes into Xray, with no private secrets stored in git.',
            'Old archives are marked as PRUNED and removed automatically by the retention policy.',
          ],
          historyTitle: 'Backup history',
          historySubtitle:
            'An archive can be downloaded, deleted, or used as the basis for host-side restore.',
          refreshList: 'Refresh list',
          archivesCount: 'Archives',
          downloading: 'Downloading...',
          download: 'Download',
          deleting: 'Deleting...',
          delete: 'Delete',
          created: 'Created',
          size: 'Size',
          fileOnDisk: 'File on disk',
          available: 'Available',
          unavailable: 'Unavailable',
          empty: 'No archives yet. Create the first backup before updates or migrations.',
          restoreTitle: (fileName: string) => `Restore: ${fileName}`,
          restoreFallbackTitle: 'Backup restore',
          restoreDanger:
            'Recovery must only be run from the host and only after confirming that the current database and runtime may be overwritten.',
          restoreLoading: 'Checking the archive and building the restore plan...',
          preflightSuccess:
            'Preflight passed. Run the dry-run first, then execute the confirmed restore in a maintenance window.',
          preflightFailed:
            'Preflight found blocking issues. Restore must not be started in this state.',
          archive: 'Archive',
          dryRun: 'Dry-run',
          checksumMatch: 'Matches',
          checksumMismatch: 'Mismatch',
          found: 'Found',
          missing: 'Missing',
          keepCurrentXrayConfig: 'Not in the archive. The current config.json will be preserved.',
          restoreOpen: 'Restore',
          restoreScope: 'Restore scope',
          restoreScopeFull: 'Database and Xray runtime config',
          restoreScopeDatabaseOnly: 'Database only, current Xray config stays in place',
          safeguardBackup: 'Automatic safeguard backup',
          included: 'Included before destructive restore',
          hostArchivePath: 'Host archive path',
          containerArchivePath: 'Container archive path',
          hostPathMissing:
            'The host backup directory is not configured. Replace the placeholder archive path manually before running restore from the host shell.',
          checklistTitle: 'Restore checklist',
          checklistHint: 'Confirm every item to unlock the destructive restore command.',
          confirmDryRun: 'I will run and review the dry-run first.',
          confirmExternalBackup:
            'I confirmed there is a fresh external backup of the current state.',
          confirmMaintenanceWindow:
            'I am restoring in a maintenance window and understand current data may be overwritten.',
          destructiveUnlockHint:
            'The destructive restore command stays locked until the checklist is confirmed and the host archive path is available.',
          verificationTitle: 'Post-restore checks',
          copyVerification: 'Copy verification bundle',
          verificationLabels: {
            composePs: 'Container status',
            apiHealthz: 'API health',
            apiReadyz: 'API readiness',
            recentLogs: 'Recent logs',
          },
          runbook: [
            'Run the dry-run on the host first and make sure every check is green.',
            'Create a fresh external backup before the real restore.',
            'Run destructive restore only during a maintenance window.',
            'Run restore on the host, not inside the application container.',
          ],
          copyDryRun: 'Copy dry-run',
          copyRestore: 'Copy restore',
          close: 'Close',
          dryRunLabel: 'Dry-run command',
          restoreLabel: 'Restore command',
          notSet: 'Not set',
        }
      : {
          loadError: 'Не удалось загрузить список резервных копий.',
          restorePlanError: 'Не удалось подготовить restore plan.',
          createError: 'Не удалось создать резервную копию.',
          downloadError: 'Не удалось скачать резервную копию.',
          deleteConfirm: (fileName: string) =>
            `Удалить backup ${fileName}? Архив на диске и запись в панели будут удалены.`,
          deleteNotice: (fileName: string) => `Backup ${fileName} удалён.`,
          deleteError: 'Не удалось удалить резервную копию.',
          copyNotice: (label: string, fileName: string) => `${label} для ${fileName} скопирована.`,
          description:
            'Управление архивами PostgreSQL и runtime-конфигом Xray с безопасным recovery workflow.',
          createAction: 'Создать backup',
          creatingAction: 'Создаём backup...',
          policyTitle: 'Политика хранения',
          policySubtitle:
            'Параметры берутся из production-конфига и соблюдаются автоматически при создании новых архивов.',
          archiveDirectory: 'Каталог архивов',
          hostArchiveDirectory: 'Каталог архивов на хосте',
          autoBackup: 'Автобэкап',
          everyDays: (days: number) => `Каждые ${days} дн.`,
          disabled: 'Выключен',
          retention: 'Retention',
          daysShort: (days: number) => `${days} дн.`,
          dryRunBeforeRestore: 'Dry-run перед restore',
          restoreCommand: 'Команда восстановления',
          restoreWorkflow: 'Restore workflow',
          restoreWorkflowText:
            'Восстановление выполняется с хоста по подтверждённой команде. Панель подсказывает точный порядок действий и конкретный архив, но не запускает destructive recovery из активной админской сессии.',
          operationsTitle: 'Операционный контур',
          operationsSubtitle:
            'Архив включает дамп PostgreSQL, runtime-конфиг Xray и manifest с датой создания.',
          operationsItems: [
            'Архивы создаются внутри контейнера API через `pg_dump`, без доступа приложения к `docker.sock`.',
            'В Xray попадает только отрендеренный runtime config, без приватных секретов в git.',
            'Старые архивы автоматически помечаются как `PRUNED` и удаляются по retention policy.',
          ],
          historyTitle: 'История backup',
          historySubtitle:
            'Архив можно скачать, удалить или использовать как основу для host-side восстановления.',
          refreshList: 'Обновить список',
          archivesCount: 'Архивы',
          downloading: 'Скачиваем...',
          download: 'Скачать',
          deleting: 'Удаляем...',
          delete: 'Удалить',
          created: 'Создан',
          size: 'Размер',
          fileOnDisk: 'Файл на диске',
          available: 'Доступен',
          unavailable: 'Недоступен',
          empty: 'Архивов пока нет. Создайте первый backup перед обновлениями или миграциями.',
          restoreTitle: (fileName: string) => `Восстановление: ${fileName}`,
          restoreFallbackTitle: 'Восстановление backup',
          restoreDanger:
            'Recovery нужно запускать только с хоста и только после подтверждения, что текущая база и runtime могут быть перезаписаны.',
          restoreLoading: 'Проверяем архив и собираем restore plan...',
          preflightSuccess:
            'Preflight пройден. Сначала выполните dry-run, затем подтверждённый restore в окно обслуживания.',
          preflightFailed:
            'Preflight нашёл блокирующие проблемы. Запускать restore в таком состоянии нельзя.',
          archive: 'Архив',
          dryRun: 'Dry-run',
          checksumMatch: 'Совпадает',
          checksumMismatch: 'Не совпадает',
          found: 'Найден',
          missing: 'Отсутствует',
          keepCurrentXrayConfig: 'Нет в архиве, будет сохранён текущий config.json',
          restoreOpen: 'Восстановить',
          restoreScope: 'Объём восстановления',
          restoreScopeFull: 'База и runtime-конфиг Xray',
          restoreScopeDatabaseOnly: 'Только база, текущий Xray config будет сохранён',
          safeguardBackup: 'Автоматический safeguard backup',
          included: 'Будет создан перед destructive restore',
          hostArchivePath: 'Путь к архиву на хосте',
          containerArchivePath: 'Путь к архиву в контейнере',
          hostPathMissing:
            'Каталог архивов на хосте не настроен. Перед запуском restore вручную подставьте реальный host path к архиву.',
          checklistTitle: 'Checklist восстановления',
          checklistHint: 'Подтвердите каждый пункт, чтобы открыть destructive restore команду.',
          confirmDryRun: 'Сначала выполню и проверю dry-run.',
          confirmExternalBackup:
            'Подтверждаю, что есть свежий внешний backup текущего состояния.',
          confirmMaintenanceWindow:
            'Восстановление выполняется в окно обслуживания, и я понимаю, что текущие данные могут быть перезаписаны.',
          destructiveUnlockHint:
            'Destructive restore команда остаётся заблокированной, пока не подтверждён checklist и не доступен host path архива.',
          verificationTitle: 'Проверки после restore',
          copyVerification: 'Скопировать post-restore checks',
          verificationLabels: {
            composePs: 'Статус контейнеров',
            apiHealthz: 'Проверка API health',
            apiReadyz: 'Проверка API readiness',
            recentLogs: 'Последние логи',
          },
          runbook: [
            'Сначала выполните dry-run на хосте и убедитесь, что все проверки зелёные.',
            'Сделайте свежий внешний backup перед реальным restore.',
            'Запускайте destructive restore только в окно обслуживания.',
            'Запускайте restore только на хосте, а не из контейнера приложения.',
          ],
          copyDryRun: 'Скопировать dry-run',
          copyRestore: 'Скопировать restore',
          close: 'Закрыть',
          dryRunLabel: 'Dry-run команда',
          restoreLabel: 'Restore команда',
          notSet: 'Не задано',
        };

  const loadBackups = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch<BackupListResponse>('/api/backups');

      setBackups(response.items);
      setBackupDir(response.policy.backupDir);
      setHostBackupDir(response.policy.hostBackupDir);
      setAutoCreateEnabled(response.policy.autoCreateEnabled);
      setAutoCreateIntervalDays(response.policy.autoCreateIntervalDays);
      setRetentionDays(response.policy.retentionDays);
      setRestoreDryRunCommand(response.policy.restoreDryRunCommand);
      setRestoreCommand(response.policy.restoreCommand);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : text.loadError);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, text.loadError]);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  useEffect(() => {
    if (!restoreTarget) {
      setRestorePlan(null);
      setIsRestorePlanLoading(false);
      setHasConfirmedDryRun(false);
      setHasConfirmedExternalBackup(false);
      setHasConfirmedMaintenanceWindow(false);
      return;
    }

    let isCancelled = false;

    const loadRestorePlan = async () => {
      setIsRestorePlanLoading(true);

      try {
        const response = await apiFetch<BackupRestorePlanResponse>(
          `/api/backups/${restoreTarget.id}/restore-plan`,
        );

        if (!isCancelled) {
          setRestorePlan(response);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setRestorePlan(null);
          setError(loadError instanceof Error ? loadError.message : text.restorePlanError);
        }
      } finally {
        if (!isCancelled) {
          setIsRestorePlanLoading(false);
        }
      }
    };

    void loadRestorePlan();

    return () => {
      isCancelled = true;
    };
  }, [apiFetch, restoreTarget, text.restorePlanError]);

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
      setError(createError instanceof Error ? createError.message : text.createError);
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
      setError(downloadError instanceof Error ? downloadError.message : text.downloadError);
    } finally {
      setIsDownloadingId(null);
    }
  };

  const handleDelete = async (backup: BackupRecord) => {
    if (!window.confirm(text.deleteConfirm(backup.fileName))) {
      return;
    }

    setIsDeletingId(backup.id);
    setError(null);
    setNotice(null);

    try {
      await apiFetch<{ id: string; success: boolean }>(`/api/backups/${backup.id}`, {
        method: 'DELETE',
      });

      setNotice(text.deleteNotice(backup.fileName));

      if (restoreTarget?.id === backup.id) {
        setRestoreTarget(null);
      }

      await loadBackups();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : text.deleteError);
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleCopyRestoreCommand = async (
    command: string,
    backup: BackupRecord,
    label: string,
  ) => {
    await navigator.clipboard.writeText(command);
    setNotice(text.copyNotice(label, backup.fileName));
  };

  const handleCopyVerificationBundle = async (
    commands: BackupRestorePlanResponse['commands']['verification'],
    backup: BackupRecord,
  ) => {
    await navigator.clipboard.writeText(commands.map((item) => item.command).join('\n'));
    setNotice(text.copyNotice(text.copyVerification, backup.fileName));
  };

  const restoreScopeLabel =
    restorePlan?.guidance.restoreScope === 'FULL'
      ? text.restoreScopeFull
      : text.restoreScopeDatabaseOnly;
  const canCopyRestoreCommand = restorePlan
    ? Boolean(
        restorePlan.preflight.canRestore &&
          restorePlan.guidance.hostPathConfigured &&
          hasConfirmedDryRun &&
          hasConfirmedExternalBackup &&
          hasConfirmedMaintenanceWindow,
      )
    : false;

  return (
    <div className="page">
      <PageHeader
        title={ui.backups.title}
        description={text.description}
        actionLabel={isReadOnly ? undefined : isCreating ? text.creatingAction : text.createAction}
        actionDisabled={isCreating}
        onAction={isReadOnly ? undefined : () => void handleCreateBackup()}
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}
      {notice ? <div className="banner banner--success">{notice}</div> : null}

      <div className="content-grid">
        <SectionCard title={text.policyTitle} subtitle={text.policySubtitle}>
          <div className="stat-grid">
            <div className="stat-card">
              <span>{text.archiveDirectory}</span>
              <strong>{backupDir || '—'}</strong>
            </div>
            <div className="stat-card">
              <span>{text.hostArchiveDirectory}</span>
              <strong>{hostBackupDir || '—'}</strong>
            </div>
            <div className="stat-card">
              <span>{text.autoBackup}</span>
              <strong>
                {autoCreateEnabled && autoCreateIntervalDays > 0
                  ? text.everyDays(autoCreateIntervalDays)
                  : text.disabled}
              </strong>
            </div>
            <div className="stat-card">
              <span>{text.retention}</span>
              <strong>{retentionDays > 0 ? text.daysShort(retentionDays) : '—'}</strong>
            </div>
          </div>

          <div className="feature-list">
            <div className="feature-list__card">
              <strong>{text.dryRunBeforeRestore}</strong>
              <code>
                {restoreDryRunCommand ||
                  './infra/scripts/restore.sh --dry-run --yes-restore /absolute/path/to/archive.tar.gz'}
              </code>
            </div>
            <div className="feature-list__card">
              <strong>{text.restoreCommand}</strong>
              <code>
                {restoreCommand ||
                  './infra/scripts/restore.sh --yes-restore /absolute/path/to/archive.tar.gz'}
              </code>
            </div>
            <div className="feature-list__card">
              <strong>{text.restoreWorkflow}</strong>
              <span>{text.restoreWorkflowText}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={text.operationsTitle} subtitle={text.operationsSubtitle}>
          <ul className="feature-list">
            {text.operationsItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title={text.historyTitle} subtitle={text.historySubtitle}>
        <div className="toolbar">
          <div className="toolbar__actions">
            <button
              className="button"
              type="button"
              onClick={() => void loadBackups()}
              disabled={isLoading}
            >
              <RefreshCw size={16} />
              {text.refreshList}
            </button>
          </div>
          <div className="topbar__chip">
            <ShieldCheck size={16} />
            {text.archivesCount}: {backups.length}
          </div>
        </div>

        <div className="backup-grid">
          {backups.map((backup) => (
            <article key={backup.id} className="backup-card">
              <div className="backup-card__header">
                <div>
                  <strong>{backup.fileName}</strong>
                  <span>{formatBackupStatus(backup.status, locale)}</span>
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
                    {isDownloadingId === backup.id ? text.downloading : text.download}
                  </button>
                  {!isReadOnly ? (
                    <>
                      <button
                        className="button"
                        type="button"
                        onClick={() => {
                          setError(null);
                          setNotice(null);
                          setRestoreTarget(backup);
                        }}
                        disabled={!backup.exists || backup.status !== 'READY'}
                      >
                        <RotateCcw size={16} />
                        {text.restoreOpen}
                      </button>
                      <button
                        className="button button--danger"
                        type="button"
                        onClick={() => void handleDelete(backup)}
                        disabled={isDeletingId === backup.id}
                      >
                        <Trash2 size={16} />
                        {isDeletingId === backup.id ? text.deleting : text.delete}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <dl className="detail-list">
                <div>
                  <dt>{text.created}</dt>
                  <dd>{formatDateTime(backup.createdAt, text.notSet, locale)}</dd>
                </div>
                <div>
                  <dt>{text.size}</dt>
                  <dd>{formatBytes(Number(backup.fileSizeBytes), locale)}</dd>
                </div>
                <div>
                  <dt>SHA-256</dt>
                  <dd className="detail-list__mono">{backup.checksumSha256}</dd>
                </div>
                <div>
                  <dt>{text.fileOnDisk}</dt>
                  <dd>{backup.exists ? text.available : text.unavailable}</dd>
                </div>
              </dl>

              {backup.notes ? <div className="backup-card__notes">{backup.notes}</div> : null}
            </article>
          ))}

          {!isLoading && backups.length === 0 ? (
            <div className="empty-state">{text.empty}</div>
          ) : null}
        </div>
      </SectionCard>

      <Modal
        isOpen={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        title={
          restoreTarget
            ? text.restoreTitle(restoreTarget.fileName)
            : text.restoreFallbackTitle
        }
      >
        {restoreTarget ? (
          <div className="detail-stack">
            <div className="banner banner--danger">{text.restoreDanger}</div>

            {isRestorePlanLoading ? (
              <div className="empty-state">{text.restoreLoading}</div>
            ) : null}

            {!isRestorePlanLoading && restorePlan ? (
              <>
                <div
                  className={`banner ${
                    restorePlan.preflight.canRestore ? 'banner--success' : 'banner--danger'
                  }`}
                >
                  {restorePlan.preflight.canRestore
                    ? text.preflightSuccess
                    : text.preflightFailed}
                </div>

                {!restorePlan.guidance.hostPathConfigured ? (
                  <div className="banner banner--danger">{text.hostPathMissing}</div>
                ) : null}

                <div className="feature-list">
                  <div className="feature-list__card">
                    <strong>{text.hostArchivePath}</strong>
                    <code>{restorePlan.backup.hostAbsolutePath ?? restorePlan.backup.absolutePath}</code>
                  </div>
                  <div className="feature-list__card">
                    <strong>{text.containerArchivePath}</strong>
                    <code>{restorePlan.backup.containerAbsolutePath}</code>
                  </div>
                  <div className="feature-list__card">
                    <strong>{text.restoreScope}</strong>
                    <span>{restoreScopeLabel}</span>
                  </div>
                  <div className="feature-list__card">
                    <strong>{text.safeguardBackup}</strong>
                    <span>
                      {restorePlan.guidance.createsSafeguardBackup ? text.included : text.disabled}
                    </span>
                  </div>
                </div>

                <dl className="detail-list">
                  <div>
                    <dt>Checksum</dt>
                    <dd>
                      {restorePlan.preflight.checksum.matches
                        ? text.checksumMatch
                        : text.checksumMismatch}
                    </dd>
                  </div>
                  <div>
                    <dt>Manifest</dt>
                    <dd>{restorePlan.preflight.files.manifest ? text.found : text.missing}</dd>
                  </div>
                  <div>
                    <dt>Postgres dump</dt>
                    <dd>{restorePlan.preflight.files.postgresDump ? text.found : text.missing}</dd>
                  </div>
                  <div>
                    <dt>Xray config</dt>
                    <dd>
                      {restorePlan.preflight.files.xrayConfig
                        ? text.found
                        : text.keepCurrentXrayConfig}
                    </dd>
                  </div>
                  <div>
                    <dt>Backup ID</dt>
                    <dd className="detail-list__mono">
                      {restorePlan.preflight.manifest.backupId ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Schema version</dt>
                    <dd>{restorePlan.preflight.manifest.schemaVersion ?? '—'}</dd>
                  </div>
                </dl>

                {restorePlan.preflight.warnings.length > 0 ? (
                  <ul className="feature-list">
                    {restorePlan.preflight.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="detail-stack restore-guide">
                  <strong>{text.checklistTitle}</strong>
                  <span className="restore-guide__hint">{text.checklistHint}</span>
                  <label className="checkbox-row restore-guide__check">
                    <input
                      type="checkbox"
                      checked={hasConfirmedDryRun}
                      onChange={(event) => setHasConfirmedDryRun(event.target.checked)}
                    />
                    <span>{text.confirmDryRun}</span>
                  </label>
                  <label className="checkbox-row restore-guide__check">
                    <input
                      type="checkbox"
                      checked={hasConfirmedExternalBackup}
                      onChange={(event) => setHasConfirmedExternalBackup(event.target.checked)}
                    />
                    <span>{text.confirmExternalBackup}</span>
                  </label>
                  <label className="checkbox-row restore-guide__check">
                    <input
                      type="checkbox"
                      checked={hasConfirmedMaintenanceWindow}
                      onChange={(event) => setHasConfirmedMaintenanceWindow(event.target.checked)}
                    />
                    <span>{text.confirmMaintenanceWindow}</span>
                  </label>
                  {!canCopyRestoreCommand ? (
                    <div className="banner">{text.destructiveUnlockHint}</div>
                  ) : null}
                </div>

                <div className="feature-list">
                  <div className="feature-list__card">
                    <strong>{text.dryRun}</strong>
                    <code>{restorePlan.commands.dryRun}</code>
                  </div>
                  <div className="feature-list__card">
                    <strong>{text.restoreCommand}</strong>
                    <code>{restorePlan.commands.restore}</code>
                  </div>
                </div>

                <div className="detail-stack restore-guide">
                  <strong>{text.verificationTitle}</strong>
                  <div className="feature-list">
                    {restorePlan.commands.verification.map((item) => (
                      <div key={item.id} className="feature-list__card">
                        <strong>{text.verificationLabels[item.id]}</strong>
                        <code>{item.command}</code>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="toolbar__actions wrap-actions">
                  <button
                    className="button"
                    type="button"
                    onClick={() =>
                      void handleCopyRestoreCommand(
                        restorePlan.commands.dryRun,
                        restoreTarget,
                        text.dryRunLabel,
                      )
                    }
                  >
                    <Copy size={16} />
                    {text.copyDryRun}
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() =>
                      void handleCopyVerificationBundle(
                        restorePlan.commands.verification,
                        restoreTarget,
                      )
                    }
                  >
                    <Copy size={16} />
                    {text.copyVerification}
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() =>
                      void handleCopyRestoreCommand(
                        restorePlan.commands.restore,
                        restoreTarget,
                        text.restoreLabel,
                      )
                    }
                    disabled={!canCopyRestoreCommand}
                  >
                    <Copy size={16} />
                    {text.copyRestore}
                  </button>
                  <button className="button" type="button" onClick={() => setRestoreTarget(null)}>
                    {text.close}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
