import { useEffect, useRef, useState } from 'react';

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
const CHART_HEIGHT = 280;
const CHART_PADDING_X = 22;
const CHART_PADDING_TOP = 18;
const CHART_PADDING_BOTTOM = 24;
const CHART_PLOT_HEIGHT = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
const CHART_PLOT_BOTTOM = CHART_HEIGHT - CHART_PADDING_BOTTOM;
const CHART_PLOT_WIDTH = CHART_WIDTH - CHART_PADDING_X * 2;
const ANALYTICS_WINDOWS = [7, 14, 30] as const;

type AnalyticsWindowDays = (typeof ANALYTICS_WINDOWS)[number];
type AnalyticsClientRecord = DashboardAnalyticsResponse['clients'][number];
type AnalyticsTimelineBucket = DashboardAnalyticsResponse['timeline'][number];
type AnalyticsClientSortKey =
  | 'windowTrafficBytes'
  | 'todayTrafficBytes'
  | 'totalTrafficBytes'
  | 'incomingBytes'
  | 'outgoingBytes'
  | 'activeConnections'
  | 'activeDays'
  | 'lastSeenAt'
  | 'displayName';
type SortDirection = 'asc' | 'desc';
type ChartPoint = {
  x: number;
  y: number;
};
type ChartBar = {
  centerX: number;
  date: string;
  incomingHeight: number;
  incomingY: number;
  outgoingHeight: number;
  outgoingY: number;
  totalY: number;
  width: number;
  x: number;
};

function buildChartBars(timeline: AnalyticsTimelineBucket[]): ChartBar[] {
  const maxTraffic = Math.max(...timeline.map((bucket) => Number(bucket.totalTrafficBytes)), 0);

  if (timeline.length === 0) {
    return [];
  }

  const bandWidth = CHART_PLOT_WIDTH / timeline.length;
  const barWidth = Math.min(46, Math.max(16, bandWidth * 0.62));

  return timeline.map((bucket, index) => {
    const totalBytes = Number(bucket.totalTrafficBytes);
    const incomingBytes = Number(bucket.incomingTrafficBytes);
    const outgoingBytes = Number(bucket.outgoingTrafficBytes);
    const x = CHART_PADDING_X + bandWidth * index + (bandWidth - barWidth) / 2;
    const totalHeight =
      maxTraffic > 0 ? (totalBytes / maxTraffic) * CHART_PLOT_HEIGHT : 0;
    const incomingHeight =
      maxTraffic > 0 ? (incomingBytes / maxTraffic) * CHART_PLOT_HEIGHT : 0;
    const outgoingHeight =
      maxTraffic > 0 ? (outgoingBytes / maxTraffic) * CHART_PLOT_HEIGHT : 0;
    const outgoingY = CHART_PLOT_BOTTOM - outgoingHeight;
    const incomingY = outgoingY - incomingHeight;

    return {
      centerX: x + barWidth / 2,
      date: bucket.date,
      incomingHeight,
      incomingY,
      outgoingHeight,
      outgoingY,
      totalY: CHART_PLOT_BOTTOM - totalHeight,
      width: barWidth,
      x,
    };
  });
}

function buildLinePath(points: ChartPoint[]) {
  if (points.length === 0) {
    return '';
  }

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function buildAreaPath(points: ChartPoint[], baselineY: number) {
  if (points.length === 0) {
    return '';
  }

  const linePath = buildLinePath(points);
  const firstPoint = points.at(0);
  const lastPoint = points.at(-1);

  if (!firstPoint || !lastPoint) {
    return '';
  }

  return `${linePath} L ${lastPoint.x.toFixed(2)} ${baselineY.toFixed(2)} L ${firstPoint.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
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

function formatWindowShort(windowDays: number, locale: Locale) {
  return locale === 'en' ? `${windowDays}d` : `${windowDays} дн`;
}

function formatWindowLong(windowDays: number, locale: Locale) {
  return locale === 'en' ? `Last ${windowDays} days` : `Последние ${windowDays} дней`;
}

function pickAxisTicks(timeline: AnalyticsTimelineBucket[]) {
  if (timeline.length <= 7) {
    return timeline;
  }

  const step = timeline.length <= 14 ? 2 : 5;

  return timeline.filter(
    (bucket, index) =>
      index === 0 || index === timeline.length - 1 || index % step === 0 || bucket.activeClients > 0,
  );
}

function compareNumbers(left: number, right: number) {
  if (left === right) {
    return 0;
  }

  return left > right ? 1 : -1;
}

function compareAnalyticsClients(
  left: AnalyticsClientRecord,
  right: AnalyticsClientRecord,
  sortKey: AnalyticsClientSortKey,
  sortDirection: SortDirection,
) {
  let comparison = 0;

  switch (sortKey) {
    case 'displayName':
      comparison = left.displayName.localeCompare(right.displayName);
      break;
    case 'lastSeenAt':
      comparison = compareNumbers(
        left.lastSeenAt ? new Date(left.lastSeenAt).getTime() : 0,
        right.lastSeenAt ? new Date(right.lastSeenAt).getTime() : 0,
      );
      break;
    case 'activeConnections':
      comparison = compareNumbers(left.activeConnections, right.activeConnections);

      if (comparison === 0) {
        comparison = compareNumbers(left.peakActiveConnections, right.peakActiveConnections);
      }
      break;
    case 'activeDays':
      comparison = compareNumbers(left.activeDays, right.activeDays);
      break;
    case 'windowTrafficBytes':
      comparison = compareNumbers(
        Number(left.windowTrafficBytes),
        Number(right.windowTrafficBytes),
      );
      break;
    case 'todayTrafficBytes':
      comparison = compareNumbers(
        Number(left.todayTrafficBytes),
        Number(right.todayTrafficBytes),
      );
      break;
    case 'totalTrafficBytes':
      comparison = compareNumbers(
        Number(left.totalTrafficBytes),
        Number(right.totalTrafficBytes),
      );
      break;
    case 'incomingBytes':
      comparison = compareNumbers(Number(left.incomingBytes), Number(right.incomingBytes));
      break;
    case 'outgoingBytes':
      comparison = compareNumbers(Number(left.outgoingBytes), Number(right.outgoingBytes));
      break;
    default:
      comparison = 0;
      break;
  }

  if (comparison === 0) {
    comparison = left.displayName.localeCompare(right.displayName);
  }

  return sortDirection === 'asc' ? comparison : comparison * -1;
}

export function AnalyticsPage() {
  const { apiFetch } = useAuth();
  const { locale, ui } = useI18n();
  const [analytics, setAnalytics] = useState<DashboardAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<AnalyticsWindowDays>(14);
  const [sortKey, setSortKey] = useState<AnalyticsClientSortKey>('windowTrafficBytes');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const requestSequenceRef = useRef(0);
  const text =
    locale === 'en'
      ? {
          loadError: 'Failed to load analytics.',
          totalTraffic: 'Total traffic',
          totalTrafficHint: 'all traffic recorded by daily usage buckets',
          windowTraffic: 'Current window',
          windowTrafficHint: 'current reporting window across the server',
          todayTraffic: 'Today',
          todayTrafficHint: 'traffic captured in the latest daily bucket',
          clientsWithTraffic: 'Clients with traffic',
          clientsWithTrafficHint: 'profiles that generated traffic in the selected window',
          chartTitle: 'Traffic timeline',
          chartSubtitle: 'Daily traffic with incoming and outgoing split for the selected window',
          chartEmpty: 'Traffic history will appear after the first usage snapshots.',
          chartLegendTotal: 'Total line',
          chartLegendIncoming: 'Incoming',
          chartLegendOutgoing: 'Outgoing',
          windowSelector: 'Window',
          peakDay: 'Peak day',
          peakDayHint: 'highest daily traffic inside the selected window',
          averageDay: 'Average day',
          averageDayHint: 'mean traffic across the current analytics window',
          activeToday: 'Seen online today',
          activeTodayHint: 'profiles seen in today’s bucket',
          onlineNow: 'Online now',
          topClient: 'Top client in window',
          topClientHint: 'client that drove the most traffic inside the selected window',
          topClientFallback: 'No traffic yet',
          directionTitle: 'Window composition',
          directionSubtitle: 'Incoming vs outgoing traffic for the current window',
          incoming: 'Incoming',
          outgoing: 'Outgoing',
          refreshedAt: 'Refreshed',
          topClientsTitle: 'Traffic leaders',
          topClientsSubtitle: 'The strongest clients inside the current analytics window',
          topClientsEmpty: 'No client traffic has been captured yet.',
          allClientsTitle: 'Per-client traffic',
          allClientsSubtitle: 'Full client list with live status and traffic totals',
          shareOfTotal: 'of total',
          shareOfWindow: 'of window',
          client: 'Client',
          status: 'Status',
          total: 'Total',
          window: 'Window',
          today: 'Today',
          inbound: 'Inbound',
          outbound: 'Outbound',
          connections: 'Connections',
          peakConnections: 'Peak',
          lastSeen: 'Last seen',
          activeDays: 'Active days',
          sortBy: 'Sort by',
          sortWindowTraffic: 'Window traffic',
          sortTodayTraffic: 'Today',
          sortTotalTraffic: 'Total traffic',
          sortLastSeen: 'Recent activity',
          sortName: 'Name',
          sortConnections: 'Connections',
          sortAscending: 'Ascending',
          sortDescending: 'Descending',
          noClients: 'Client analytics will appear after the first traffic snapshots.',
          notAvailable: 'Not available',
        }
      : {
          loadError: 'Не удалось загрузить аналитику.',
          totalTraffic: 'Весь трафик',
          totalTrafficHint: 'весь трафик, записанный в daily usage buckets',
          windowTraffic: 'Текущее окно',
          windowTrafficHint: 'текущее аналитическое окно по всему серверу',
          todayTraffic: 'Сегодня',
          todayTrafficHint: 'трафик, попавший в текущий дневной бакет',
          clientsWithTraffic: 'Клиенты с трафиком',
          clientsWithTrafficHint: 'профили, которые дали трафик в выбранном окне',
          chartTitle: 'График трафика',
          chartSubtitle: 'Дневная нагрузка с разрезом на входящий и исходящий трафик',
          chartEmpty: 'История появится после первых usage snapshots.',
          chartLegendTotal: 'Итоговая линия',
          chartLegendIncoming: 'Входящий',
          chartLegendOutgoing: 'Исходящий',
          windowSelector: 'Период',
          peakDay: 'Пиковый день',
          peakDayHint: 'максимальный дневной трафик внутри выбранного окна',
          averageDay: 'Средний день',
          averageDayHint: 'средний объём трафика по текущему аналитическому окну',
          activeToday: 'Замечено онлайн сегодня',
          activeTodayHint: 'профили, попавшие в сегодняшний бакет',
          onlineNow: 'Онлайн сейчас',
          topClient: 'Лидер окна',
          topClientHint: 'клиент, который дал больше всего трафика в выбранном окне',
          topClientFallback: 'Трафика пока нет',
          directionTitle: 'Состав окна',
          directionSubtitle: 'Входящий и исходящий трафик за текущее окно',
          incoming: 'Входящий',
          outgoing: 'Исходящий',
          refreshedAt: 'Обновлено',
          topClientsTitle: 'Лидеры по трафику',
          topClientsSubtitle: 'Клиенты, которые сильнее всего нагружают выбранное окно',
          topClientsEmpty: 'Трафик клиентов пока не зафиксирован.',
          allClientsTitle: 'Трафик по клиентам',
          allClientsSubtitle: 'Полный список клиентов с live-статусом и объёмами трафика',
          shareOfTotal: 'от общего',
          shareOfWindow: 'от окна',
          client: 'Клиент',
          status: 'Статус',
          total: 'Всего',
          window: 'Окно',
          today: 'Сегодня',
          inbound: 'Входящий',
          outbound: 'Исходящий',
          connections: 'Подключения',
          peakConnections: 'Пик',
          lastSeen: 'Последний онлайн',
          activeDays: 'Активных дней',
          sortBy: 'Сортировка',
          sortWindowTraffic: 'Трафик окна',
          sortTodayTraffic: 'Сегодня',
          sortTotalTraffic: 'Весь трафик',
          sortLastSeen: 'Последняя активность',
          sortName: 'Имя',
          sortConnections: 'Подключения',
          sortAscending: 'По возрастанию',
          sortDescending: 'По убыванию',
          noClients: 'Аналитика по клиентам появится после первых снимков трафика.',
          notAvailable: 'Не указано',
        };

  const loadAnalytics = async (windowDays: AnalyticsWindowDays = selectedWindow) => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setIsLoading(true);

    try {
      const nextAnalytics = await apiFetch<DashboardAnalyticsResponse>(
        `/api/dashboard/analytics?windowDays=${windowDays}`,
      );

      if (requestSequenceRef.current === requestSequence) {
        setAnalytics(nextAnalytics);
        setError(null);
      }
    } catch (loadError) {
      if (requestSequenceRef.current === requestSequence) {
        setError(loadError instanceof Error ? loadError.message : text.loadError);
      }
    } finally {
      if (requestSequenceRef.current === requestSequence) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadAnalyticsSafely = async () => {
      const requestSequence = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestSequence;
      setIsLoading(true);

      try {
        const nextAnalytics = await apiFetch<DashboardAnalyticsResponse>(
          `/api/dashboard/analytics?windowDays=${selectedWindow}`,
        );

        if (isMounted && requestSequenceRef.current === requestSequence) {
          setAnalytics(nextAnalytics);
          setError(null);
        }
      } catch (loadError) {
        if (isMounted && requestSequenceRef.current === requestSequence) {
          setError(loadError instanceof Error ? loadError.message : text.loadError);
        }
      } finally {
        if (isMounted && requestSequenceRef.current === requestSequence) {
          setIsLoading(false);
        }
      }
    };

    void loadAnalyticsSafely();

    return () => {
      isMounted = false;
    };
  }, [apiFetch, selectedWindow, text.loadError]);

  const timeline = analytics?.timeline ?? [];
  const axisTicks = pickAxisTicks(timeline);
  const chartBars = buildChartBars(timeline);
  const chartLinePoints = chartBars.map((bar) => ({
    x: bar.centerX,
    y: bar.totalY,
  }));
  const linePath = buildLinePath(chartLinePoints);
  const areaPath = buildAreaPath(chartLinePoints, CHART_PLOT_BOTTOM);
  const maxChartValue = Math.max(...timeline.map((bucket) => Number(bucket.totalTrafficBytes)), 0);
  const midChartValue = maxChartValue > 0 ? maxChartValue / 2 : 0;
  const peakBucket = timeline.reduce<AnalyticsTimelineBucket | null>((currentPeak, bucket) => {
    if (!currentPeak || Number(bucket.totalTrafficBytes) > Number(currentPeak.totalTrafficBytes)) {
      return bucket;
    }

    return currentPeak;
  }, null);
  const peakBucketTrafficBytes = Number(peakBucket?.totalTrafficBytes ?? '0');
  const totalTrafficValue = Number(analytics?.totals.totalTrafficBytes ?? '0');
  const selectedWindowLabel = formatWindowLong(selectedWindow, locale);
  const sortedClients = [...(analytics?.clients ?? [])].sort((left, right) =>
    compareAnalyticsClients(left, right, sortKey, sortDirection),
  );
  const topClients = sortedClients
    .filter((client) => Number(client.windowTrafficBytes) > 0)
    .slice(0, 6);
  const leaderboardTopBytes = Number(topClients[0]?.windowTrafficBytes ?? '0');
  const sortOptions = [
    { key: 'windowTrafficBytes' as const, label: text.sortWindowTraffic },
    { key: 'todayTrafficBytes' as const, label: text.sortTodayTraffic },
    { key: 'totalTrafficBytes' as const, label: text.sortTotalTraffic },
    { key: 'activeConnections' as const, label: text.sortConnections },
    { key: 'lastSeenAt' as const, label: text.sortLastSeen },
    { key: 'displayName' as const, label: text.sortName },
  ];
  const windowOptions = analytics?.availableWindows ?? [...ANALYTICS_WINDOWS];

  const metrics = [
    {
      label: text.totalTraffic,
      value: formatBytes(totalTrafficValue, locale),
      hint: text.totalTrafficHint,
    },
    {
      label: selectedWindowLabel,
      value: formatBytes(Number(analytics?.totals.windowTrafficBytes ?? '0'), locale),
      hint: text.windowTrafficHint,
    },
    {
      label: text.todayTraffic,
      value: formatBytes(Number(analytics?.totals.todayTrafficBytes ?? '0'), locale),
      hint: text.todayTrafficHint,
    },
    {
      label: text.clientsWithTraffic,
      value: String(analytics?.totals.uniqueClientsWithTraffic ?? 0),
      hint: text.clientsWithTrafficHint,
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title={ui.analytics.title}
        description={ui.analytics.description}
        actionLabel={ui.common.refresh}
        actionDisabled={isLoading}
        onAction={() => {
          void loadAnalytics(selectedWindow);
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
          <div className="analytics-toolbar">
            <div className="analytics-toolbar__group analytics-toolbar__group--window">
              <span className="analytics-toolbar__label">{text.windowSelector}</span>
              <div className="analytics-window-switch" role="group" aria-label={text.windowSelector}>
                {windowOptions.map((windowDays) => (
                  <button
                    key={windowDays}
                    className={`analytics-window-switch__button ${
                      selectedWindow === windowDays ? 'analytics-window-switch__button--active' : ''
                    }`}
                    type="button"
                    aria-pressed={selectedWindow === windowDays}
                    disabled={isLoading}
                    onClick={() => {
                      setSelectedWindow(windowDays as AnalyticsWindowDays);
                    }}
                  >
                    {formatWindowShort(windowDays, locale)}
                  </button>
                ))}
              </div>
            </div>

            <div className="analytics-toolbar__group analytics-toolbar__group--chips analytics-toolbar__group--summary">
              <div className="topbar__chip">
                <strong>{selectedWindowLabel}</strong>
                <span>{text.windowTrafficHint}</span>
              </div>
              <div className="topbar__chip">
                <strong>{formatBytes(Number(analytics?.totals.windowTrafficBytes ?? '0'), locale)}</strong>
                <span>{text.windowTraffic}</span>
              </div>
            </div>
          </div>

          {timeline.length === 0 ? (
            <div className="empty-state">{text.chartEmpty}</div>
          ) : (
            <div className="analytics-chart">
              <div className="analytics-chart__legend" aria-hidden="true">
                <span className="analytics-chart__legend-item">
                  <i className="analytics-chart__legend-swatch analytics-chart__legend-swatch--total" />
                  {text.chartLegendTotal}
                </span>
                <span className="analytics-chart__legend-item">
                  <i className="analytics-chart__legend-swatch analytics-chart__legend-swatch--incoming" />
                  {text.chartLegendIncoming}
                </span>
                <span className="analytics-chart__legend-item">
                  <i className="analytics-chart__legend-swatch analytics-chart__legend-swatch--outgoing" />
                  {text.chartLegendOutgoing}
                </span>
              </div>

              <div className="analytics-chart__surface">
                <div className="analytics-chart__grid" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className="analytics-chart__y-axis" aria-hidden="true">
                  <span>{formatBytes(maxChartValue, locale)}</span>
                  <span>{formatBytes(midChartValue, locale)}</span>
                  <span>0</span>
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
                  {chartBars.map((bar) => (
                    <g key={bar.date}>
                      {bar.outgoingHeight > 0 ? (
                        <rect
                          x={bar.x}
                          y={bar.outgoingY}
                          width={bar.width}
                          height={bar.outgoingHeight}
                          rx="10"
                          fill="rgba(255, 255, 255, 0.18)"
                        />
                      ) : null}
                      {bar.incomingHeight > 0 ? (
                        <rect
                          x={bar.x}
                          y={bar.incomingY}
                          width={bar.width}
                          height={bar.incomingHeight}
                          rx="10"
                          fill="rgba(255, 255, 255, 0.36)"
                        />
                      ) : null}
                    </g>
                  ))}

                  {linePath ? (
                    <path
                      d={linePath}
                      fill="none"
                      stroke="rgba(255,255,255,0.94)"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}

                  {chartLinePoints.map((point, index) => (
                    <circle
                      key={timeline[index]?.date ?? index}
                      cx={point.x}
                      cy={point.y}
                      r="4.5"
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

              <div className="analytics-chart__footer">
                <div className="topbar__chip">
                  <strong>
                    {peakBucketTrafficBytes > 0 && peakBucket
                      ? formatChartDate(peakBucket.date, locale)
                      : text.notAvailable}
                  </strong>
                  <span>
                    {text.peakDay}: {formatBytes(peakBucketTrafficBytes, locale)}
                  </span>
                </div>
                <div className="topbar__chip">
                  <strong>{analytics?.totals.onlineNow ?? 0}</strong>
                  <span>{text.onlineNow}</span>
                </div>
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
                <p>{text.activeTodayHint}. {text.onlineNow}: {analytics?.totals.onlineNow ?? 0}</p>
              </div>
              <div className="insight-card">
                <span>{text.peakDay}</span>
                <strong>
                  {peakBucketTrafficBytes > 0 && peakBucket
                    ? formatChartDate(peakBucket.date, locale)
                    : text.notAvailable}
                </strong>
                <p>
                  {text.peakDayHint}
                  {peakBucketTrafficBytes > 0 ? ` • ${formatBytes(peakBucketTrafficBytes, locale)}` : ''}
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
                  const totalBytes = Number(client.windowTrafficBytes);
                  const topBytes = leaderboardTopBytes;
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
        <div className="analytics-table-toolbar">
          <div className="analytics-toolbar__group">
            <span className="analytics-toolbar__label">{text.sortBy}</span>
            <div className="analytics-sort-switch" role="group" aria-label={text.sortBy}>
              {sortOptions.map((option) => (
                <button
                  key={option.key}
                  className={`analytics-sort-switch__button ${
                    sortKey === option.key ? 'analytics-sort-switch__button--active' : ''
                  }`}
                  type="button"
                  aria-pressed={sortKey === option.key}
                  onClick={() => {
                    setSortKey(option.key);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <button
            className="button button--compact"
            type="button"
            onClick={() => {
              setSortDirection((currentDirection) =>
                currentDirection === 'desc' ? 'asc' : 'desc',
              );
            }}
          >
            {sortDirection === 'desc' ? text.sortDescending : text.sortAscending}
          </button>
        </div>

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
                  <th className="analytics-table__col--connections">{text.connections}</th>
                  <th className="analytics-table__col--active-days">{text.activeDays}</th>
                  <th className="analytics-table__col--last-seen">{text.lastSeen}</th>
                </tr>
              </thead>
              <tbody>
                {sortedClients.map((client) => {
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
                        <div className="analytics-connections-cell">
                          <strong>{client.activeConnections}</strong>
                          <span>
                            {text.peakConnections}: {client.peakActiveConnections}
                          </span>
                        </div>
                      </td>
                      <td>
                        {client.activeDays}
                        <span className="analytics-table__hint">
                          / {selectedWindow}
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
