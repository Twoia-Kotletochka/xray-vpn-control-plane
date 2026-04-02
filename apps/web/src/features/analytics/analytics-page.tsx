import { useEffect, useState } from 'react';

import { MetricCard } from '../../components/ui/metric-card';
import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import type { Locale } from '../../i18n';
import { useI18n } from '../../i18n';
import type { DashboardAnalyticsResponse } from '../../lib/api-types';
import {
  formatBytes,
  formatClientLiveStatus,
  formatDateTime,
  liveStatusTone,
  resolveClientLiveStatus,
} from '../../lib/format';
import { useAuth } from '../auth/auth-context';

const CHART_WIDTH = 960;
const CHART_HEIGHT = 260;

function buildChartPoints(values: number[], width: number, height: number) {
  const max = Math.max(...values, 0);

  if (values.length === 0) {
    return [];
  }

  if (values.length === 1) {
    return [
      {
        x: width / 2,
        y: max > 0 ? 24 : height - 18,
      },
    ];
  }

  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = max > 0 ? height - (value / max) * (height - 28) - 14 : height - 18;

    return { x, y };
  });
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return '';
  }

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function buildAreaPath(points: Array<{ x: number; y: number }>, height: number) {
  if (points.length === 0) {
    return '';
  }

  const linePath = buildLinePath(points);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return `${linePath} L ${lastPoint.x.toFixed(2)} ${height.toFixed(2)} L ${firstPoint.x.toFixed(2)} ${height.toFixed(2)} Z`;
}

function formatSharePercent(value: number, total: number, locale: Locale) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(total) || total <= 0) {
    return '0%';
  }

  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'ru-RU', {
    maximumFractionDigits: value / total > 0.1 ? 0 : 1,
  }).format((value / total) * 100) + '%';
}

function formatChartDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

export function AnalyticsPage() {
  const { apiFetch } = useAuth();
  const { locale, ui } = useI18n();
  const [analytics, setAnalytics] = useState<DashboardAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text =
    locale === 'en'
      ? {
          loadError: 'Failed to load analytics.',
          totalTraffic: 'Total traffic',
          totalTrafficHint: 'all traffic recorded by daily usage buckets',
          windowTraffic: 'Last 14 days',
          windowTrafficHint: 'current reporting window across the server',
          todayTraffic: 'Today',
          todayTrafficHint: 'traffic captured in the latest daily bucket',
          onlineNow: 'Online now',
          onlineNowHint: 'clients with live connections right now',
          chartTitle: 'Traffic timeline',
          chartSubtitle: 'Daily server traffic for the latest 14 buckets',
          chartEmpty: 'Traffic history will appear after the first usage snapshots.',
          averageDay: 'Average day',
          averageDayHint: 'mean traffic across the current analytics window',
          activeToday: 'Seen online today',
          activeTodayHint: 'profiles that appeared in today’s runtime snapshot',
          peakDay: 'Peak online day',
          peakDayHint: 'highest number of simultaneously active clients in a day',
          topClient: 'Top client',
          topClientHint: 'highest all-time traffic total',
          topClientFallback: 'No traffic yet',
          directionTitle: 'Window composition',
          directionSubtitle: 'Incoming vs outgoing traffic for the current window',
          incoming: 'Incoming',
          outgoing: 'Outgoing',
          refreshedAt: 'Refreshed',
          topClientsTitle: 'Traffic leaders',
          topClientsSubtitle: 'The clients that currently generate the most traffic',
          topClientsEmpty: 'No client traffic has been captured yet.',
          allClientsTitle: 'Per-client traffic',
          allClientsSubtitle: 'Full client list with live status and traffic totals',
          shareOfTotal: 'of total',
          client: 'Client',
          status: 'Status',
          total: 'Total',
          window: '14 days',
          today: 'Today',
          inbound: 'Inbound',
          outbound: 'Outbound',
          lastSeen: 'Last seen',
          activeDays: 'Active days',
          noClients: 'Client analytics will appear after the first traffic snapshots.',
          notAvailable: 'Not available',
        }
      : {
          loadError: 'Не удалось загрузить аналитику.',
          totalTraffic: 'Весь трафик',
          totalTrafficHint: 'весь трафик, записанный в daily usage buckets',
          windowTraffic: 'Последние 14 дней',
          windowTrafficHint: 'текущее аналитическое окно по всему серверу',
          todayTraffic: 'Сегодня',
          todayTrafficHint: 'трафик, попавший в текущий дневной бакет',
          onlineNow: 'Онлайн сейчас',
          onlineNowHint: 'клиенты с live-подключениями прямо сейчас',
          chartTitle: 'График трафика',
          chartSubtitle: 'Ежедневная нагрузка сервера по последним 14 бакетам',
          chartEmpty: 'История появится после первых usage snapshots.',
          averageDay: 'Средний день',
          averageDayHint: 'средний объём трафика по текущему аналитическому окну',
          activeToday: 'Замечено онлайн сегодня',
          activeTodayHint: 'профили, попавшие в сегодняшний runtime snapshot',
          peakDay: 'Пик по онлайну',
          peakDayHint: 'максимум одновременно активных клиентов за день',
          topClient: 'Топ-клиент',
          topClientHint: 'клиент с наибольшим общим объёмом трафика',
          topClientFallback: 'Трафика пока нет',
          directionTitle: 'Состав окна',
          directionSubtitle: 'Входящий и исходящий трафик за текущее окно',
          incoming: 'Входящий',
          outgoing: 'Исходящий',
          refreshedAt: 'Обновлено',
          topClientsTitle: 'Лидеры по трафику',
          topClientsSubtitle: 'Клиенты, которые сейчас дают наибольшую нагрузку',
          topClientsEmpty: 'Трафик клиентов пока не зафиксирован.',
          allClientsTitle: 'Трафик по клиентам',
          allClientsSubtitle: 'Полный список клиентов с live-статусом и объёмами трафика',
          shareOfTotal: 'от общего',
          client: 'Клиент',
          status: 'Статус',
          total: 'Всего',
          window: '14 дней',
          today: 'Сегодня',
          inbound: 'Входящий',
          outbound: 'Исходящий',
          lastSeen: 'Последний онлайн',
          activeDays: 'Активных дней',
          noClients: 'Аналитика по клиентам появится после первых снимков трафика.',
          notAvailable: 'Не указано',
        };

  const loadAnalytics = async () => {
    try {
      const nextAnalytics = await apiFetch<DashboardAnalyticsResponse>('/api/dashboard/analytics');

      setAnalytics(nextAnalytics);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : text.loadError);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadAnalyticsSafely = async () => {
      try {
        const nextAnalytics = await apiFetch<DashboardAnalyticsResponse>('/api/dashboard/analytics');

        if (isMounted) {
          setAnalytics(nextAnalytics);
          setError(null);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : text.loadError);
        }
      }
    };

    void loadAnalyticsSafely();

    return () => {
      isMounted = false;
    };
  }, [apiFetch, text.loadError]);

  const timeline = analytics?.timeline ?? [];
  const totalTrafficValue = Number(analytics?.totals.totalTrafficBytes ?? '0');
  const chartValues = timeline.map((bucket) => Number(bucket.totalTrafficBytes));
  const chartPoints = buildChartPoints(chartValues, CHART_WIDTH, CHART_HEIGHT);
  const linePath = buildLinePath(chartPoints);
  const areaPath = buildAreaPath(chartPoints, CHART_HEIGHT);
  const topClients = (analytics?.clients ?? [])
    .filter((client) => Number(client.totalTrafficBytes) > 0)
    .slice(0, 6);
  const axisTicks = timeline.filter(
    (bucket, index) =>
      index === 0 || index === timeline.length - 1 || index % 2 === 0 || bucket.activeClients > 0,
  );

  const metrics = [
    {
      label: text.totalTraffic,
      value: formatBytes(totalTrafficValue, locale),
      hint: text.totalTrafficHint,
    },
    {
      label: text.windowTraffic,
      value: formatBytes(Number(analytics?.totals.windowTrafficBytes ?? '0'), locale),
      hint: text.windowTrafficHint,
    },
    {
      label: text.todayTraffic,
      value: formatBytes(Number(analytics?.totals.todayTrafficBytes ?? '0'), locale),
      hint: text.todayTrafficHint,
    },
    {
      label: text.onlineNow,
      value: String(analytics?.totals.onlineNow ?? 0),
      hint: text.onlineNowHint,
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title={ui.analytics.title}
        description={ui.analytics.description}
        actionLabel={ui.common.refresh}
        onAction={() => {
          void loadAnalytics();
        }}
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <div className="metrics-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="split-grid split-grid--analytics">
        <SectionCard title={text.chartTitle} subtitle={text.chartSubtitle}>
          {timeline.length === 0 ? (
            <div className="empty-state">{text.chartEmpty}</div>
          ) : (
            <div className="analytics-chart">
              <div className="analytics-chart__surface">
                <div className="analytics-chart__grid" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <svg
                  className="analytics-chart__svg"
                  viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                  role="img"
                  aria-label={text.chartTitle}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="analytics-traffic-fill" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgba(255, 255, 255, 0.42)" />
                      <stop offset="100%" stopColor="rgba(255, 255, 255, 0.04)" />
                    </linearGradient>
                  </defs>

                  {areaPath ? <path d={areaPath} fill="url(#analytics-traffic-fill)" /> : null}
                  {linePath ? <path d={linePath} fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /> : null}

                  {chartPoints.map((point, index) => (
                    <circle
                      key={timeline[index]?.date ?? index}
                      cx={point.x}
                      cy={point.y}
                      r="5"
                      fill="rgba(255,255,255,0.96)"
                    />
                  ))}
                </svg>
              </div>

              <div className="analytics-chart__axis">
                {axisTicks.map((bucket) => (
                  <span key={bucket.date}>{formatChartDate(bucket.date, locale)}</span>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title={text.topClientsTitle} subtitle={text.topClientsSubtitle}>
          <div className="analytics-side-panel">
            <div className="analytics-side-panel__stats">
              <div className="insight-card">
                <span>{text.averageDay}</span>
                <strong>{formatBytes(Number(analytics?.totals.averageDailyTrafficBytes ?? '0'), locale)}</strong>
                <p>{text.averageDayHint}</p>
              </div>
              <div className="insight-card">
                <span>{text.activeToday}</span>
                <strong>{String(analytics?.totals.activeClientsToday ?? 0)}</strong>
                <p>
                  {text.activeTodayHint}. {text.peakDayHint}: {analytics?.totals.peakActiveClients ?? 0}
                </p>
              </div>
              <div className="insight-card">
                <span>{text.topClient}</span>
                <strong>
                  {analytics?.totals.topClientDisplayName ?? text.topClientFallback}
                </strong>
                <p>
                  {text.topClientHint}
                  {analytics?.totals.topClientDisplayName
                    ? ` • ${formatBytes(Number(analytics?.totals.topClientTrafficBytes ?? '0'), locale)}`
                    : ''}
                </p>
              </div>
            </div>

            <div className="analytics-direction-card">
              <div className="section-card__header analytics-direction-card__header">
                <div>
                  <h3>{text.directionTitle}</h3>
                  <p>{text.directionSubtitle}</p>
                </div>
              </div>

              <div className="analytics-direction-card__rows">
                {[
                  {
                    label: text.incoming,
                    value: Number(analytics?.totals.windowIncomingBytes ?? '0'),
                  },
                  {
                    label: text.outgoing,
                    value: Number(analytics?.totals.windowOutgoingBytes ?? '0'),
                  },
                ].map((item) => {
                  const totalWindow = Number(analytics?.totals.windowTrafficBytes ?? '0');
                  const width =
                    item.value > 0 && totalWindow > 0
                      ? `${Math.max(8, (item.value / totalWindow) * 100)}%`
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
                {text.refreshedAt}:{' '}
                {formatDateTime(analytics?.generatedAt ?? null, text.notAvailable, locale)}
              </p>
            </div>

            <div className="analytics-leaderboard">
              {topClients.length > 0 ? (
                topClients.map((client, index) => {
                  const totalBytes = Number(client.totalTrafficBytes);
                  const topBytes = Number(topClients[0]?.totalTrafficBytes ?? '0');
                  const width =
                    totalBytes > 0 && topBytes > 0
                      ? `${Math.max(12, (totalBytes / topBytes) * 100)}%`
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
                        <strong>{formatBytes(totalBytes, locale)}</strong>
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
      </div>

      <SectionCard title={text.allClientsTitle} subtitle={text.allClientsSubtitle}>
        {analytics && analytics.clients.length > 0 ? (
          <div className="table-shell">
            <table className="data-table analytics-table">
              <thead>
                <tr>
                  <th className="analytics-table__col--client">{text.client}</th>
                  <th className="analytics-table__col--status">{text.status}</th>
                  <th className="analytics-table__col--traffic">{text.total}</th>
                  <th className="analytics-table__col--traffic">{text.window}</th>
                  <th className="analytics-table__col--traffic">{text.today}</th>
                  <th className="analytics-table__col--traffic">{text.inbound}</th>
                  <th className="analytics-table__col--traffic">{text.outbound}</th>
                  <th className="analytics-table__col--active-days">{text.activeDays}</th>
                  <th className="analytics-table__col--last-seen">{text.lastSeen}</th>
                </tr>
              </thead>
              <tbody>
                {analytics.clients.map((client) => {
                  const liveStatus = resolveClientLiveStatus({
                    activeConnections: client.activeConnections,
                    status: client.status,
                  });
                  const totalBytes = Number(client.totalTrafficBytes);

                  return (
                    <tr key={client.id}>
                      <td>
                        <div className="table-main">
                          <strong>{client.displayName}</strong>
                          <span>{client.emailTag}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill status-pill--${liveStatusTone(liveStatus)}`}>
                          {formatClientLiveStatus(liveStatus, locale)}
                        </span>
                      </td>
                      <td>
                        <div className="analytics-traffic-cell">
                          <strong>{formatBytes(totalBytes, locale)}</strong>
                          <span>
                            {formatSharePercent(totalBytes, totalTrafficValue, locale)} {text.shareOfTotal}
                          </span>
                          <div className="analytics-share">
                            <span
                              style={{
                                width:
                                  totalBytes > 0 && totalTrafficValue > 0
                                    ? `${Math.max(10, (totalBytes / totalTrafficValue) * 100)}%`
                                    : '0%',
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>{formatBytes(Number(client.windowTrafficBytes), locale)}</td>
                      <td>{formatBytes(Number(client.todayTrafficBytes), locale)}</td>
                      <td>{formatBytes(Number(client.incomingBytes), locale)}</td>
                      <td>{formatBytes(Number(client.outgoingBytes), locale)}</td>
                      <td>
                        {client.activeDays}
                        <span className="analytics-table__hint">
                          / {analytics.windowDays}
                        </span>
                      </td>
                      <td>{formatDateTime(client.lastSeenAt, text.notAvailable, locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">{analytics ? text.noClients : ui.common.loading}</div>
        )}
      </SectionCard>
    </div>
  );
}
