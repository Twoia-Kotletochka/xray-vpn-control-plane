import { useEffect, useMemo, useState } from 'react';

import { MetricCard } from '../../components/ui/metric-card';
import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { StatusPill } from '../../components/ui/status-pill';
import { useI18n } from '../../i18n';
import type { DashboardAnalyticsResponse, DashboardSummary } from '../../lib/api-types';
import { formatBytes, formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

const DASHBOARD_TRAFFIC_WINDOW_DAYS = 14;

function formatPercent(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function formatBucketDate(value: string | null, locale: 'ru' | 'en') {
  if (!value) {
    return locale === 'en' ? 'Not available' : 'Не указано';
  }

  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
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
  const [analytics, setAnalytics] = useState<DashboardAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text =
    locale === 'en'
      ? {
          loadError: 'Failed to load the dashboard.',
          trafficTitle: 'Traffic',
          trafficWindow: `Last ${DASHBOARD_TRAFFIC_WINDOW_DAYS} days`,
          trafficToday: 'Today',
          trafficLeader: 'Top client',
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
          trafficTitle: 'Трафик',
          trafficWindow: `Последние ${DASHBOARD_TRAFFIC_WINDOW_DAYS} дней`,
          trafficToday: 'Сегодня',
          trafficLeader: 'Лидер',
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
        const [nextSummary, nextAnalytics] = await Promise.all([
          apiFetch<DashboardSummary>('/api/dashboard/summary'),
          apiFetch<DashboardAnalyticsResponse>(
            `/api/dashboard/analytics?windowDays=${DASHBOARD_TRAFFIC_WINDOW_DAYS}`,
          ),
        ]);

        if (isMounted) {
          setSummary(nextSummary);
          setAnalytics(nextAnalytics);
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

  const topClients = useMemo(
    () =>
      [...(analytics?.clients ?? [])]
        .filter((client) => Number(client.windowTrafficBytes) > 0)
        .sort((left, right) => Number(right.windowTrafficBytes) - Number(left.windowTrafficBytes))
        .slice(0, 5),
    [analytics?.clients],
  );
  const peakBucket = useMemo(
    () =>
      (analytics?.timeline ?? []).reduce<DashboardAnalyticsResponse['timeline'][number] | null>(
        (currentPeak, bucket) => {
          if (!currentPeak || Number(bucket.totalTrafficBytes) > Number(currentPeak.totalTrafficBytes)) {
            return bucket;
          }

          return currentPeak;
        },
        null,
      ),
    [analytics?.timeline],
  );
  const windowTrafficBytes = Number(analytics?.totals.windowTrafficBytes ?? '0');
  const incomingWindowBytes = Number(analytics?.totals.windowIncomingBytes ?? '0');
  const outgoingWindowBytes = Number(analytics?.totals.windowOutgoingBytes ?? '0');
  const topLeaderBytes = Number(topClients[0]?.windowTrafficBytes ?? '0');

  return (
    <div className="page">
      <PageHeader
        title={ui.dashboard.title}
        actionLabel={ui.common.refresh}
        onAction={() => {
          void Promise.all([
            apiFetch<DashboardSummary>('/api/dashboard/summary'),
            apiFetch<DashboardAnalyticsResponse>(
              `/api/dashboard/analytics?windowDays=${DASHBOARD_TRAFFIC_WINDOW_DAYS}`,
            ),
          ])
            .then(([nextSummary, nextAnalytics]) => {
              setSummary(nextSummary);
              setAnalytics(nextAnalytics);
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

      <div className="split-grid">
        <SectionCard title={text.trafficTitle}>
          <div className="dashboard-trends">
            <div className="dashboard-trends__overview">
              <div className="insight-card">
                <span>{text.trafficWindow}</span>
                <strong>{formatBytes(windowTrafficBytes, locale)}</strong>
              </div>
              <div className="insight-card">
                <span>{text.trafficToday}</span>
                <strong>{formatBytes(Number(analytics?.totals.todayTrafficBytes ?? '0'), locale)}</strong>
              </div>
              <div className="insight-card">
                <span>{text.peakDay}</span>
                <strong>{peakBucket ? formatBucketDate(peakBucket.date, locale) : text.notYet}</strong>
              </div>
              <div className="insight-card">
                <span>{text.trafficLeader}</span>
                <strong>{analytics?.totals.topClientDisplayName ?? text.notYet}</strong>
              </div>
            </div>

            <div className="analytics-direction-card">
              <div className="analytics-direction-card__rows">
                {[
                  { label: text.incoming, value: incomingWindowBytes },
                  { label: text.outgoing, value: outgoingWindowBytes },
                ].map((item) => {
                  const width =
                    item.value > 0 && windowTrafficBytes > 0
                      ? `${Math.max(8, (item.value / windowTrafficBytes) * 100)}%`
                      : '0%';

                  return (
                    <div key={item.label} className="analytics-direction-card__row">
                      <div className="analytics-direction-card__meta">
                        <strong>{item.label}</strong>
                        <span>{formatBytes(item.value, locale)}</span>
                      </div>
                      <div className="analytics-share">
                        <span style={{ width }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="analytics-direction-card__timestamp">
                {text.refreshedAt}: {formatDateTime(analytics?.generatedAt ?? null, text.notYet, locale)}
              </p>
            </div>

            <div className="analytics-leaderboard">
              <strong>{text.topClients}</strong>
              {topClients.length > 0 ? (
                topClients.map((client, index) => {
                  const clientBytes = Number(client.windowTrafficBytes);
                  const width =
                    clientBytes > 0 && topLeaderBytes > 0
                      ? `${Math.max(12, (clientBytes / topLeaderBytes) * 100)}%`
                      : '0%';

                  return (
                    <article key={client.id} className="analytics-leaderboard__item">
                      <div className="analytics-leaderboard__meta">
                        <div>
                          <strong>
                            {index + 1}. {client.displayName}
                          </strong>
                          <span>{client.emailTag}</span>
                        </div>
                        <strong>{formatBytes(clientBytes, locale)}</strong>
                      </div>
                      <div className="analytics-share analytics-share--leaderboard">
                        <span style={{ width }} />
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="empty-state">{text.topClientsEmpty}</div>
              )}
            </div>
          </div>
        </SectionCard>

        <div className="detail-stack">
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
      </div>
    </div>
  );
}
