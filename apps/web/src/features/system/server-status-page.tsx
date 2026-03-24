import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { StatusPill } from '../../components/ui/status-pill';
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
  const [response, setResponse] = useState<SystemStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const nextResponse = await apiFetch<SystemStatusResponse>('/api/system/status');
      setResponse(nextResponse);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Не удалось загрузить статус системы.',
      );
    }
  }, [apiFetch]);

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
          : 'Не удалось выполнить ручную синхронизацию.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Состояние сервера"
        description="Текущие сигналы по основным сервисам платформы, статусу Xray и ручным операциям рантайма."
        actionLabel="Обновить"
        onAction={() => {
          void loadStatus();
        }}
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <div className="content-grid">
        <SectionCard title="Сервисы">
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
                  <span>{service.latencyMs} мс</span>
                  <StatusPill tone={serviceTone(service.status)}>{service.status}</StatusPill>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Runtime и ручные действия">
          <ul className="feature-list">
            <li>{response?.message ?? 'Собираем состояние сервисов...'}</li>
            <li>CPU: {formatPercent(response?.host.cpuPercent ?? null)}</li>
            <li>RAM: {formatPercent(response?.host.ramPercent ?? null)}</li>
            <li>Disk: {formatPercent(response?.host.diskPercent ?? null)}</li>
            <li>Онлайн пользователей Xray: {response?.runtime.onlineUsers ?? 0}</li>
            <li>
              Последний sync runtime:{' '}
              {formatDateTime(response?.runtime.lastConfigSyncAt ?? null, 'ещё не выполнялся')}
            </li>
            <li>
              Последний snapshot трафика:{' '}
              {formatDateTime(response?.runtime.lastStatsSnapshotAt ?? null, 'ещё не выполнялся')}
            </li>
            <li>
              Uptime Xray:{' '}
              {response?.runtime.uptimeSeconds ? `${response.runtime.uptimeSeconds} с` : '—'}
            </li>
          </ul>

          <div className="toolbar__actions wrap-actions">
            <button
              className="button"
              disabled={isSubmitting}
              type="button"
              onClick={() => void handleManualSync('/api/xray/snapshot')}
            >
              Снять snapshot трафика
            </button>
            <button
              className="button button--primary"
              disabled={isSubmitting}
              type="button"
              onClick={() => void handleManualSync('/api/xray/sync')}
            >
              Синхронизировать Xray
            </button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
