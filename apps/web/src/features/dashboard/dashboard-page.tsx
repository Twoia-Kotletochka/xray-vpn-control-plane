import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

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

function formatDelta(value: number | null) {
  if (value === null) {
    return '—';
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
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
  const { admin, apiFetch } = useAuth();
  const { locale, ui } = useI18n();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isReadOnly = admin?.role === 'READ_ONLY';
  const text =
    locale === 'en'
      ? {
          loadError: 'Failed to load the dashboard.',
          overviewTitle: 'Traffic pulse',
          overviewSubtitle:
            'Recent traffic, active clients, and current load without drilling into the analytics workspace.',
          runtimeTitle: 'Runtime status',
          runtimeSubtitle:
            'The live Xray contour, snapshots, and host pressure for quick operational checks.',
          actionsTitle: 'Workspaces',
          actionsSubtitle:
            'Jump straight into the main operational flows with minimal navigation friction.',
          onlineNow: 'Online now',
          clientsSeen: 'Clients seen',
          onlineHint: 'live connections reported by the Xray runtime',
          activeProfiles: 'Active profiles',
          activeProfilesHint: 'clients with ACTIVE status and ready to connect',
          expiredClients: 'Expired clients',
          expiredHint: 'updated automatically from the expiry date',
          totalTraffic: 'Total traffic',
          totalTrafficHint: 'aggregated from daily usage buckets',
          totalClients: 'Total clients',
          totalClientsHint: 'active, expired, disabled, and blocked clients',
          cpuHint: 'approximate current environment load',
          ramHint: 'runtime memory usage',
          diskHint: 'available container filesystem capacity',
          peakDay: 'Peak day',
          peakDayHint: 'the busiest traffic bucket inside the current trend window',
          averageDay: 'Average day',
          averageDayHint: 'mean traffic across the current trend window',
          trafficDelta: 'Trend delta',
          trafficDeltaHint: 'comparison of the last 7 days versus the previous 7 days',
          peakClients: 'Peak clients',
          peakClientsHint: 'highest number of clients seen inside one daily bucket',
          recentTrafficEmpty: 'Traffic history will appear after the next usage snapshots.',
          incoming: 'Incoming',
          outgoing: 'Outgoing',
          runtimeHealth: 'Xray runtime',
          runtimeUsers: 'Xray online users',
          lastSnapshot: 'Last traffic snapshot',
          lastSync: 'Last config sync',
          cpu: 'CPU',
          ram: 'RAM',
          disk: 'Disk',
          notYet: 'not performed yet',
          createClient: 'Create client',
          createClientHint: 'Open the composer directly in the client workspace.',
          openClients: 'Open clients',
          openClientsHint: 'Search, filter, and manage client access inline.',
          openConnections: 'Open connections',
          openConnectionsHint: 'Inspect config delivery templates and connection outputs.',
          openTraffic: 'Open traffic',
          openTrafficHint: 'Move to the analytics tab for charts and per-client usage.',
          openSystem: 'Open system',
          openSystemHint: 'Review runtime status, health signals, and manual actions.',
        }
      : {
          loadError: 'Не удалось загрузить дашборд.',
          overviewTitle: 'Пульс трафика',
          overviewSubtitle:
            'Последняя нагрузка, активные клиенты и текущее состояние без перехода в аналитику.',
          runtimeTitle: 'Состояние runtime',
          runtimeSubtitle:
            'Живой контур Xray, снимки трафика и давление на хост для быстрых операционных проверок.',
          actionsTitle: 'Рабочие разделы',
          actionsSubtitle:
            'Быстрые переходы в основные рабочие зоны без лишней навигации и потери контекста.',
          onlineNow: 'Онлайн сейчас',
          clientsSeen: 'Клиентов замечено',
          onlineHint: 'live-подключения по данным Xray runtime',
          activeProfiles: 'Активные профили',
          activeProfilesHint: 'клиенты со статусом ACTIVE, готовые к подключению',
          expiredClients: 'Истекшие клиенты',
          expiredHint: 'автоматически обновляется по сроку действия',
          totalTraffic: 'Суммарный трафик',
          totalTrafficHint: 'агрегировано по daily usage buckets',
          totalClients: 'Всего клиентов',
          totalClientsHint: 'активные, истекшие, отключенные и заблокированные клиенты',
          cpuHint: 'приблизительная текущая загрузка окружения',
          ramHint: 'использование памяти по данным рантайма',
          diskHint: 'доступная ёмкость файловой системы контейнера',
          peakDay: 'Пиковый день',
          peakDayHint: 'самый загруженный бакет в текущем окне трендов',
          averageDay: 'Средний день',
          averageDayHint: 'средний трафик по текущему окну трендов',
          trafficDelta: 'Дельта тренда',
          trafficDeltaHint: 'сравнение последних 7 дней с предыдущими 7 днями',
          peakClients: 'Пик клиентов',
          peakClientsHint: 'максимум клиентов, замеченных в одном дневном бакете',
          recentTrafficEmpty: 'История появится после следующих usage snapshots.',
          incoming: 'Входящий',
          outgoing: 'Исходящий',
          runtimeHealth: 'Xray runtime',
          runtimeUsers: 'Онлайн пользователей Xray',
          lastSnapshot: 'Последний snapshot трафика',
          lastSync: 'Последний sync конфига',
          cpu: 'CPU',
          ram: 'RAM',
          disk: 'Disk',
          notYet: 'ещё не выполнялся',
          createClient: 'Создать клиента',
          createClientHint: 'Открыть composer прямо в рабочем разделе клиентов.',
          openClients: 'Открыть клиентов',
          openClientsHint: 'Искать, фильтровать и управлять доступом прямо из таблицы.',
          openConnections: 'Открыть подключения',
          openConnectionsHint: 'Проверить шаблоны выдачи конфигов и connection outputs.',
          openTraffic: 'Открыть трафик',
          openTrafficHint: 'Перейти в аналитику за графиками и детализацией по клиентам.',
          openSystem: 'Открыть систему',
          openSystemHint: 'Посмотреть runtime, health-сигналы и ручные действия.',
        };

  useEffect(() => {
    let isMounted = true;

    const loadSummary = async () => {
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

    void loadSummary();

    return () => {
      isMounted = false;
    };
  }, [apiFetch, text.loadError]);

  const metrics = [
    {
      label: text.activeProfiles,
      value: String(summary?.totals.available ?? summary?.totals.active ?? 0),
      hint: text.activeProfilesHint,
    },
    {
      label: text.onlineNow,
      value: String(summary?.totals.onlineNow ?? summary?.runtime.onlineUsers ?? 0),
      hint: text.onlineHint,
    },
    {
      label: text.expiredClients,
      value: String(summary?.totals.expired ?? 0),
      hint: text.expiredHint,
    },
    {
      label: text.totalTraffic,
      value: formatBytes(Number(summary?.totals.totalTrafficBytes ?? '0'), locale),
      hint: text.totalTrafficHint,
    },
    {
      label: text.totalClients,
      value: String(summary?.totals.clients ?? 0),
      hint: text.totalClientsHint,
    },
    {
      label: text.cpu,
      value: formatPercent(summary?.host.cpuPercent ?? null),
      hint: text.cpuHint,
    },
    {
      label: text.ram,
      value: formatPercent(summary?.host.ramPercent ?? null),
      hint: text.ramHint,
    },
    {
      label: text.disk,
      value: formatPercent(summary?.host.diskPercent ?? null),
      hint: text.diskHint,
    },
  ];

  const comparison = summary?.trends.comparisons;
  const recentBuckets = useMemo(() => (summary?.trends.buckets ?? []).slice(-6), [summary?.trends.buckets]);
  const maxRecentTraffic = useMemo(
    () => recentBuckets.reduce((currentMax, bucket) => Math.max(currentMax, Number(bucket.totalTrafficBytes)), 0),
    [recentBuckets],
  );

  return (
    <div className="page">
      <PageHeader
        title={ui.dashboard.title}
        description={ui.dashboard.description}
        actions={
          <div className="page-header__actions">
            {!isReadOnly ? (
              <Link className="button button--primary" to="/clients?composer=1">
                {text.createClient}
              </Link>
            ) : null}
            <button
              className="button button--ghost"
              type="button"
              onClick={() => {
                void apiFetch<DashboardSummary>('/api/dashboard/summary')
                  .then((nextSummary) => {
                    setSummary(nextSummary);
                    setError(null);
                  })
                  .catch((loadError) => {
                    setError(loadError instanceof Error ? loadError.message : text.loadError);
                  });
              }}
            >
              {ui.common.refresh}
            </button>
          </div>
        }
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <div className="metrics-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="split-grid">
        <SectionCard title={text.overviewTitle} subtitle={text.overviewSubtitle}>
          <div className="dashboard-trends">
            <div className="dashboard-trends__overview">
              <div className="insight-card">
                <span>{text.peakDay}</span>
                <strong>{formatBucketDate(comparison?.busiestDayDate ?? null, locale)}</strong>
                <p>
                  {text.peakDayHint}
                  {comparison?.busiestDayTrafficBytes
                    ? ` • ${formatBytes(Number(comparison.busiestDayTrafficBytes), locale)}`
                    : ''}
                </p>
              </div>
              <div className="insight-card">
                <span>{text.averageDay}</span>
                <strong>{formatBytes(Number(comparison?.averageDailyTrafficBytes ?? '0'), locale)}</strong>
                <p>{text.averageDayHint}</p>
              </div>
              <div className="insight-card">
                <span>{text.trafficDelta}</span>
                <strong>{formatDelta(comparison?.trafficDeltaPercent ?? null)}</strong>
                <p>{text.trafficDeltaHint}</p>
              </div>
              <div className="insight-card">
                <span>{text.peakClients}</span>
                <strong>{String(comparison?.peakActiveClients ?? 0)}</strong>
                <p>{text.peakClientsHint}</p>
              </div>
            </div>

            {recentBuckets.length > 0 ? (
              <div className="history-list">
                {recentBuckets.map((bucket) => {
                  const width =
                    maxRecentTraffic > 0
                      ? `${Math.max(10, (Number(bucket.totalTrafficBytes) / maxRecentTraffic) * 100)}%`
                      : '10%';

                  return (
                    <div key={bucket.date} className="history-row">
                      <div className="history-row__meta">
                        <strong>{formatBucketDate(bucket.date, locale)}</strong>
                        <span>{formatBytes(Number(bucket.totalTrafficBytes), locale)}</span>
                      </div>
                      <div className="history-row__bar">
                        <span style={{ width }} />
                      </div>
                      <div className="history-row__details">
                        <span>
                          {text.incoming}: {formatBytes(Number(bucket.incomingTrafficBytes), locale)}
                        </span>
                        <span>
                          {text.outgoing}: {formatBytes(Number(bucket.outgoingTrafficBytes), locale)}
                        </span>
                        <span>
                          {text.clientsSeen}: {bucket.activeClients}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">{text.recentTrafficEmpty}</div>
            )}
          </div>
        </SectionCard>

        <div className="detail-stack">
          <SectionCard title={text.runtimeTitle} subtitle={text.runtimeSubtitle}>
            <div className="status-list">
              <div className="status-row">
                <div className="status-row__content">
                  <strong>{text.runtimeHealth}</strong>
                  <span>{summary?.message ?? ui.common.loading}</span>
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
                  <span>{formatDateTime(summary?.runtime.lastStatsSnapshotAt ?? null, text.notYet, locale)}</span>
                </div>
                <div className="status-row__meta">
                  <span>{text.onlineNow}: {summary?.totals.onlineNow ?? 0}</span>
                </div>
              </div>
              <div className="status-row">
                <div className="status-row__content">
                  <strong>{text.lastSync}</strong>
                  <span>{formatDateTime(summary?.runtime.lastConfigSyncAt ?? null, text.notYet, locale)}</span>
                </div>
                <div className="status-row__meta">
                  <span>{text.activeProfiles}: {summary?.totals.available ?? summary?.totals.active ?? 0}</span>
                </div>
              </div>
              <div className="status-row">
                <div className="status-row__content">
                  <strong>{text.cpu}</strong>
                  <span>{text.cpuHint}</span>
                </div>
                <div className="status-row__meta">
                  <span>{formatPercent(summary?.host.cpuPercent ?? null)}</span>
                </div>
              </div>
              <div className="status-row">
                <div className="status-row__content">
                  <strong>{text.ram}</strong>
                  <span>{text.ramHint}</span>
                </div>
                <div className="status-row__meta">
                  <span>{formatPercent(summary?.host.ramPercent ?? null)}</span>
                </div>
              </div>
              <div className="status-row">
                <div className="status-row__content">
                  <strong>{text.disk}</strong>
                  <span>{text.diskHint}</span>
                </div>
                <div className="status-row__meta">
                  <span>{formatPercent(summary?.host.diskPercent ?? null)}</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={text.actionsTitle} subtitle={text.actionsSubtitle}>
            <div className="logs-source-list">
              {!isReadOnly ? (
                <Link className="logs-source-button" to="/clients?composer=1">
                  <strong>{text.createClient}</strong>
                  <span>{text.createClientHint}</span>
                </Link>
              ) : null}
              <Link className="logs-source-button" to="/clients">
                <strong>{text.openClients}</strong>
                <span>{text.openClientsHint}</span>
              </Link>
              <Link className="logs-source-button" to="/subscriptions">
                <strong>{text.openConnections}</strong>
                <span>{text.openConnectionsHint}</span>
              </Link>
              <Link className="logs-source-button" to="/analytics">
                <strong>{text.openTraffic}</strong>
                <span>{text.openTrafficHint}</span>
              </Link>
              <Link className="logs-source-button" to="/server-status">
                <strong>{text.openSystem}</strong>
                <span>{text.openSystemHint}</span>
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
