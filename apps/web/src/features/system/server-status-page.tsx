import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { StatusPill } from '../../components/ui/status-pill';
import { useI18n } from '../../i18n';
import type { SystemStatusResponse } from '../../lib/api-types';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

function serviceTone(status: string) {
  if (status === 'up' || status === 'healthy') {
    return 'success' as const;
  }

  if (status === 'unknown') {
    return 'warning' as const;
  }

  return 'danger' as const;
}

function formatPercent(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

export function ServerStatusPage() {
  const { apiFetch } = useAuth();
  const { locale, ui } = useI18n();
  const [response, setResponse] = useState<SystemStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const text =
    locale === 'en'
      ? {
          loadError: 'Failed to load system status.',
          syncError: 'Failed to run the manual runtime action.',
          description:
            'Current signals for core platform services, Xray status, and manual runtime actions.',
          servicesTitle: 'Services',
          runtimeTitle: 'Runtime and manual actions',
          collecting: 'Collecting service health...',
          xrayUsers: 'Xray online users',
          lastSync: 'Last runtime sync',
          lastSnapshot: 'Last traffic snapshot',
          notYet: 'not performed yet',
          uptime: 'Xray uptime',
          seconds: 's',
          snapshotAction: 'Capture traffic snapshot',
          syncAction: 'Sync Xray',
          latencyMs: 'ms',
        }
      : {
          loadError: 'Не удалось загрузить статус системы.',
          syncError: 'Не удалось выполнить ручную синхронизацию.',
          description:
            'Текущие сигналы по основным сервисам платформы, статусу Xray и ручным операциям рантайма.',
          servicesTitle: 'Сервисы',
          runtimeTitle: 'Runtime и ручные действия',
          collecting: 'Собираем состояние сервисов...',
          xrayUsers: 'Онлайн пользователей Xray',
          lastSync: 'Последний sync runtime',
          lastSnapshot: 'Последний snapshot трафика',
          notYet: 'ещё не выполнялся',
          uptime: 'Uptime Xray',
          seconds: 'с',
          snapshotAction: 'Снять snapshot трафика',
          syncAction: 'Синхронизировать Xray',
          latencyMs: 'мс',
        };

  const loadStatus = useCallback(async () => {
    try {
      const nextResponse = await apiFetch<SystemStatusResponse>('/api/system/status');
      setResponse(nextResponse);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : text.loadError);
    }
  }, [apiFetch, text.loadError]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleManualSync = async (path: '/api/xray/snapshot' | '/api/xray/sync') => {
    setIsSubmitting(true);

    try {
      await apiFetch<{ success: boolean }>(path, {
        method: 'POST',
      });
      await loadStatus();
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : text.syncError,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={ui.serverStatus.title}
        description={text.description}
        actionLabel={ui.common.refresh}
        onAction={() => {
          void loadStatus();
        }}
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <div className="content-grid">
        <SectionCard title={text.servicesTitle}>
          <div className="status-list">
            {response?.services.map((service) => (
              <div key={service.name} className="status-row">
                <div className="status-row__content">
                  <strong>{service.name}</strong>
                  <span>
                    {service.target} • {service.details}
                  </span>
                </div>
                <div className="status-row__meta">
                  <span>{service.latencyMs} {text.latencyMs}</span>
                  <StatusPill tone={serviceTone(service.status)}>{service.status}</StatusPill>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={text.runtimeTitle}>
          <ul className="feature-list">
            <li>{response?.message ?? text.collecting}</li>
            <li>CPU: {formatPercent(response?.host.cpuPercent ?? null)}</li>
            <li>RAM: {formatPercent(response?.host.ramPercent ?? null)}</li>
            <li>Disk: {formatPercent(response?.host.diskPercent ?? null)}</li>
            <li>{text.xrayUsers}: {response?.runtime.onlineUsers ?? 0}</li>
            <li>
              {text.lastSync}:{' '}
              {formatDateTime(response?.runtime.lastConfigSyncAt ?? null, text.notYet, locale)}
            </li>
            <li>
              {text.lastSnapshot}:{' '}
              {formatDateTime(response?.runtime.lastStatsSnapshotAt ?? null, text.notYet, locale)}
            </li>
            <li>
              {text.uptime}:{' '}
              {response?.runtime.uptimeSeconds ? `${response.runtime.uptimeSeconds} ${text.seconds}` : '—'}
            </li>
          </ul>

          <div className="toolbar__actions wrap-actions">
            <button
              className="button"
              disabled={isSubmitting}
              type="button"
              onClick={() => void handleManualSync('/api/xray/snapshot')}
            >
              {text.snapshotAction}
            </button>
            <button
              className="button button--primary"
              disabled={isSubmitting}
              type="button"
              onClick={() => void handleManualSync('/api/xray/sync')}
            >
              {text.syncAction}
            </button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
