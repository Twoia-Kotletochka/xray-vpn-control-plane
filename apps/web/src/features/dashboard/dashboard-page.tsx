import { useEffect, useState } from 'react';

import { MetricCard } from '../../components/ui/metric-card';
import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { StatusPill } from '../../components/ui/status-pill';
import { useI18n } from '../../i18n';
import type { DashboardSummary } from '../../lib/api-types';
import { formatBytes, formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

function formatPercent(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function runtimeTone(status: string | null | undefined) {
  if (!status) {
    return 'warning' as const;
  }

  if (status === 'up' || status === 'healthy') {
    return 'success' as const;
  }

  if (status === 'unknown') {
    return 'warning' as const;
  }

  return 'danger' as const;
}

export function DashboardPage() {
  const { apiFetch } = useAuth();
  const { locale, ui } = useI18n();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text =
    locale === 'en'
      ? {
          loadError: 'Failed to load the dashboard.',
          runtimeTitle: 'Runtime status',
          onlineNow: 'Online now',
          activeProfiles: 'Active profiles',
          expiredClients: 'Expired clients',
          totalTraffic: 'Total traffic',
          totalClients: 'Total clients',
          peakDay: 'Peak day',
          averageDay: 'Average day',
          trafficMix: 'Window composition',
          topClients: 'Traffic leaders',
          topClientsEmpty: 'Traffic leaders will appear after the first snapshots.',
          incoming: 'Incoming',
          outgoing: 'Outgoing',
          refreshedAt: 'Refreshed',
          runtimeHealth: 'Xray runtime',
          runtimeUsers: 'Xray online users',
          lastSnapshot: 'Last traffic snapshot',
          lastSync: 'Last config sync',
          cpu: 'CPU',
          ram: 'RAM',
          disk: 'Disk',
          notYet: 'not performed yet',
        }
      : {
          loadError: 'Не удалось загрузить дашборд.',
          runtimeTitle: 'Состояние runtime',
          onlineNow: 'Онлайн сейчас',
          activeProfiles: 'Активные профили',
          expiredClients: 'Истекшие клиенты',
          totalTraffic: 'Суммарный трафик',
          totalClients: 'Всего клиентов',
          peakDay: 'Пиковый день',
          averageDay: 'Средний день',
          trafficMix: 'Состав окна',
          topClients: 'Лидеры по трафику',
          topClientsEmpty: 'Лидеры появятся после первых снимков трафика.',
          incoming: 'Входящий',
          outgoing: 'Исходящий',
          refreshedAt: 'Обновлено',
          runtimeHealth: 'Xray runtime',
          runtimeUsers: 'Онлайн пользователей Xray',
          lastSnapshot: 'Последний snapshot трафика',
          lastSync: 'Последний sync конфига',
          cpu: 'CPU',
          ram: 'RAM',
          disk: 'Disk',
          notYet: 'ещё не выполнялся',
        };

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      try {
        const nextSummary = await apiFetch<DashboardSummary>('/api/dashboard/summary');

        if (isMounted) {
          setSummary(nextSummary);
          setError(null);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : text.loadError);
        }
      }
    };

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [apiFetch, text.loadError]);

  const metrics = [
    {
      label: text.activeProfiles,
      value: String(summary?.totals.available ?? summary?.totals.active ?? 0),
    },
    {
      label: text.onlineNow,
      value: String(summary?.totals.onlineNow ?? summary?.runtime.onlineUsers ?? 0),
    },
    {
      label: text.expiredClients,
      value: String(summary?.totals.expired ?? 0),
    },
    {
      label: text.totalTraffic,
      value: formatBytes(Number(summary?.totals.totalTrafficBytes ?? '0'), locale),
    },
    {
      label: text.totalClients,
      value: String(summary?.totals.clients ?? 0),
    },
    {
      label: text.cpu,
      value: formatPercent(summary?.host.cpuPercent ?? null),
    },
    {
      label: text.ram,
      value: formatPercent(summary?.host.ramPercent ?? null),
    },
    {
      label: text.disk,
      value: formatPercent(summary?.host.diskPercent ?? null),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title={ui.dashboard.title}
        actionLabel={ui.common.refresh}
        onAction={() => {
          void apiFetch<DashboardSummary>('/api/dashboard/summary')
            .then((nextSummary) => {
              setSummary(nextSummary);
              setError(null);
            })
            .catch((loadError) => {
              setError(loadError instanceof Error ? loadError.message : text.loadError);
            });
        }}
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <div className="metrics-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <SectionCard title={text.runtimeTitle}>
        <div className="status-list">
          <div className="status-row">
            <div className="status-row__content">
              <strong>{text.runtimeHealth}</strong>
            </div>
            <div className="status-row__meta">
              <span>{text.runtimeUsers}: {summary?.runtime.onlineUsers ?? 0}</span>
              <StatusPill tone={runtimeTone(summary?.runtime.xrayStatus)}>
                {summary?.runtime.xrayStatus ?? 'unknown'}
              </StatusPill>
            </div>
          </div>
          <div className="status-row">
            <div className="status-row__content">
              <strong>{text.lastSnapshot}</strong>
            </div>
            <div className="status-row__meta">
              <span>{formatDateTime(summary?.runtime.lastStatsSnapshotAt ?? null, text.notYet, locale)}</span>
              <span>{text.onlineNow}: {summary?.totals.onlineNow ?? 0}</span>
            </div>
          </div>
          <div className="status-row">
            <div className="status-row__content">
              <strong>{text.lastSync}</strong>
            </div>
            <div className="status-row__meta">
              <span>{formatDateTime(summary?.runtime.lastConfigSyncAt ?? null, text.notYet, locale)}</span>
              <span>{text.activeProfiles}: {summary?.totals.available ?? summary?.totals.active ?? 0}</span>
            </div>
          </div>
          <div className="status-row">
            <div className="status-row__content">
              <strong>{text.cpu}</strong>
            </div>
            <div className="status-row__meta">
              <span>{formatPercent(summary?.host.cpuPercent ?? null)}</span>
            </div>
          </div>
          <div className="status-row">
            <div className="status-row__content">
              <strong>{text.ram}</strong>
            </div>
            <div className="status-row__meta">
              <span>{formatPercent(summary?.host.ramPercent ?? null)}</span>
            </div>
          </div>
          <div className="status-row">
            <div className="status-row__content">
              <strong>{text.disk}</strong>
            </div>
            <div className="status-row__meta">
              <span>{formatPercent(summary?.host.diskPercent ?? null)}</span>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
