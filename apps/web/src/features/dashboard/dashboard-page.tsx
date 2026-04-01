import { useEffect, useState } from 'react';

import { MetricCard } from '../../components/ui/metric-card';
import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import type { Locale } from '../../i18n';
import { useI18n } from '../../i18n';
import type { DashboardSummary } from '../../lib/api-types';
import { formatBytes, formatDate, formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

function formatPercent(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function formatTrendDelta(value: number | null, locale: Locale) {
  if (value === null) {
    return '—';
  }

  return `${new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'ru-RU', {
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(value)}%`;
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
          onlineNow: 'Online now',
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
          summaryTitle: 'Current summary',
          availableSummary: 'Active profiles',
          disabledSummary: 'Disabled clients',
          blockedSummary: 'Blocked clients',
          onlineSummary: 'Clients online right now',
          xrayStatus: 'Xray control API status',
          lastSnapshot: 'Last traffic snapshot',
          snapshotFallback: 'not captured yet',
          loadingSummary: 'Loading summary from PostgreSQL...',
          operationsTitle: 'Operations contour',
          refreshSessions: 'Administrators work through refresh sessions and an audit log.',
          controlApi:
            'Clients are synced to Xray through the control API without giving the app access to docker.sock.',
          lastSync: 'Last successful Xray sync',
          syncFallback: 'not performed yet',
          trendsTitle: 'Traffic and activity trends',
          trendsSubtitle: 'Last 14 daily buckets across the whole server',
          currentWindowTraffic: 'Last 7 days',
          currentWindowTrafficHint: 'sum of the latest daily traffic buckets',
          previousWindowTraffic: 'Previous 7 days',
          previousWindowTrafficHint: 'baseline for the current window',
          trafficDelta: 'Traffic delta',
          trafficDeltaHint: 'change between the current and previous windows',
          averageDailyTraffic: 'Average day',
          averageDailyTrafficHint: 'average daily traffic across the full 14-day window',
          busiestDay: 'Peak day',
          busiestDayHint: 'the busiest traffic day in the 14-day window',
          busiestDayFallback: 'No traffic yet',
          activeClientsToday: 'Seen online today',
          activeClientsTodayHint: 'profiles that appeared in daily live snapshots today',
          peakActiveClients: 'Peak online day',
          peakActiveClientsHint: 'maximum active clients in a daily snapshot',
          activeClientsSeen: 'Clients seen online',
          trendEmpty: 'Traffic trends will appear after the first daily usage snapshots.',
          notAvailable: 'Not available',
        }
      : {
          loadError: 'Не удалось загрузить дашборд.',
          onlineNow: 'Онлайн сейчас',
          onlineHint: 'реальные live-подключения по данным Xray runtime',
          activeProfiles: 'Активные профили',
          activeProfilesHint: 'клиенты со статусом ACTIVE, готовые к подключению',
          expiredClients: 'Истекшие клиенты',
          expiredHint: 'автоматически обновляется по сроку действия',
          totalTraffic: 'Суммарный трафик',
          totalTrafficHint: 'агрегировано по daily usage buckets',
          totalClients: 'Всего клиентов',
          totalClientsHint: 'активные, истекшие, отключенные и заблокированные',
          cpuHint: 'приблизительная текущая загрузка окружения',
          ramHint: 'использование памяти по данным рантайма',
          diskHint: 'доступная ёмкость файловой системы контейнера',
          summaryTitle: 'Текущая сводка',
          availableSummary: 'Активные профили',
          disabledSummary: 'Отключенных клиентов',
          blockedSummary: 'Заблокированных клиентов',
          onlineSummary: 'Клиентов онлайн сейчас',
          xrayStatus: 'Статус Xray control API',
          lastSnapshot: 'Последний snapshot трафика',
          snapshotFallback: 'ещё не выполнялся',
          loadingSummary: 'Загрузка сводки из PostgreSQL...',
          operationsTitle: 'Операционный контур',
          refreshSessions: 'Администратор работает через refresh-сессии и журнал аудита.',
          controlApi:
            'Клиенты синхронизируются с Xray через control API без доступа приложения к docker.sock.',
          lastSync: 'Последняя успешная синхронизация Xray',
          syncFallback: 'ещё не выполнялась',
          trendsTitle: 'Тренды нагрузки',
          trendsSubtitle: 'Последние 14 daily buckets по всему серверу',
          currentWindowTraffic: 'Последние 7 дней',
          currentWindowTrafficHint: 'сумма по последним ежедневным бакетам трафика',
          previousWindowTraffic: 'Предыдущие 7 дней',
          previousWindowTrafficHint: 'база сравнения для текущего окна',
          trafficDelta: 'Дельта трафика',
          trafficDeltaHint: 'изменение между текущим и предыдущим окном',
          averageDailyTraffic: 'Средний день',
          averageDailyTrafficHint: 'средний объём трафика за всё 14-дневное окно',
          busiestDay: 'Пиковый день',
          busiestDayHint: 'день с максимальным объёмом трафика в окне',
          busiestDayFallback: 'Трафика пока нет',
          activeClientsToday: 'Замечено онлайн сегодня',
          activeClientsTodayHint: 'профили, попавшие в дневные live-снимки за сегодня',
          peakActiveClients: 'Пик по онлайн-клиентам',
          peakActiveClientsHint: 'максимум активных клиентов в дневном срезе',
          activeClientsSeen: 'Клиентов замечено онлайн',
          trendEmpty: 'Тренды появятся после первых ежедневных usage snapshots.',
          notAvailable: 'Не указано',
        };

  useEffect(() => {
    let isMounted = true;

    const loadSummary = async () => {
      try {
        const nextSummary = await apiFetch<DashboardSummary>('/api/dashboard/summary');

        if (isMounted) {
          setSummary(nextSummary);
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
      label: 'CPU',
      value: formatPercent(summary?.host.cpuPercent ?? null),
      hint: text.cpuHint,
    },
    {
      label: 'RAM',
      value: formatPercent(summary?.host.ramPercent ?? null),
      hint: text.ramHint,
    },
    {
      label: 'Disk',
      value: formatPercent(summary?.host.diskPercent ?? null),
      hint: text.diskHint,
    },
  ];
  const trendBuckets = summary?.trends.buckets ?? [];
  const trendTrafficMax = trendBuckets.reduce(
    (max, bucket) => Math.max(max, Number(bucket.totalTrafficBytes)),
    0,
  );
  const busiestDayHint = summary?.trends.comparisons.busiestDayDate
    ? `${text.busiestDayHint}: ${formatDate(
        summary.trends.comparisons.busiestDayDate,
        text.notAvailable,
        locale,
      )}`
    : text.busiestDayFallback;
  const activeClientsTodayHint = `${text.activeClientsTodayHint}. ${text.peakActiveClientsHint}: ${
    summary?.trends.comparisons.peakActiveClients ?? 0
  }`;
  const trendHighlights = [
    {
      label: text.currentWindowTraffic,
      value: formatBytes(Number(summary?.trends.comparisons.last7DaysTrafficBytes ?? '0'), locale),
      hint: text.currentWindowTrafficHint,
    },
    {
      label: text.previousWindowTraffic,
      value: formatBytes(
        Number(summary?.trends.comparisons.previous7DaysTrafficBytes ?? '0'),
        locale,
      ),
      hint: text.previousWindowTrafficHint,
    },
    {
      label: text.trafficDelta,
      value: formatTrendDelta(summary?.trends.comparisons.trafficDeltaPercent ?? null, locale),
      hint: text.trafficDeltaHint,
    },
    {
      label: text.averageDailyTraffic,
      value: formatBytes(
        Number(summary?.trends.comparisons.averageDailyTrafficBytes ?? '0'),
        locale,
      ),
      hint: text.averageDailyTrafficHint,
    },
    {
      label: text.busiestDay,
      value: formatBytes(Number(summary?.trends.comparisons.busiestDayTrafficBytes ?? '0'), locale),
      hint: busiestDayHint,
    },
    {
      label: text.activeClientsToday,
      value: String(summary?.trends.comparisons.activeClientsToday ?? 0),
      hint: activeClientsTodayHint,
    },
  ];
  const trendContent = !summary ? (
    <div className="empty-state">{text.loadingSummary}</div>
  ) : trendBuckets.length === 0 ? (
    <div className="empty-state">{text.trendEmpty}</div>
  ) : (
    trendBuckets.map((bucket) => {
      const width =
        trendTrafficMax > 0
          ? `${Math.max(8, (Number(bucket.totalTrafficBytes) / trendTrafficMax) * 100)}%`
          : '8%';

      return (
        <div key={bucket.date} className="history-row">
          <div className="history-row__meta">
            <strong>{formatDate(bucket.date, text.notAvailable, locale)}</strong>
            <span>{formatBytes(Number(bucket.totalTrafficBytes), locale)}</span>
          </div>
          <div className="history-row__bar">
            <span style={{ width }} />
          </div>
          <div className="history-row__details">
            <span>
              {text.activeClientsSeen}: {bucket.activeClients}
            </span>
          </div>
        </div>
      );
    })
  );

  return (
    <div className="page">
      <PageHeader
        title={ui.dashboard.title}
        description={
          locale === 'en'
            ? 'Operational summary for active profiles, live connections, traffic, Xray runtime, and service health.'
            : 'Операционная сводка по активным профилям, live-подключениям, трафику, runtime Xray и состоянию сервисов.'
        }
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

      <SectionCard title={text.trendsTitle} subtitle={text.trendsSubtitle}>
        <div className="dashboard-trends">
          <div className="dashboard-trends__overview">
            {trendHighlights.map((item) => (
              <div key={item.label} className="insight-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.hint}</p>
              </div>
            ))}
          </div>

          <div className="history-list">
            {trendContent}
          </div>
        </div>
      </SectionCard>

      <div className="content-grid">
        <SectionCard title={text.summaryTitle}>
          <ul className="feature-list">
            <li>
              {text.availableSummary}: {summary?.totals.available ?? summary?.totals.active ?? 0}
            </li>
            <li>
              {text.disabledSummary}: {summary?.totals.disabled ?? 0}
            </li>
            <li>
              {text.blockedSummary}: {summary?.totals.blocked ?? 0}
            </li>
            <li>
              {text.onlineSummary}:{' '}
              {summary?.totals.onlineNow ?? summary?.runtime.onlineUsers ?? 0}
            </li>
            <li>
              {text.xrayStatus}: {summary?.runtime.xrayStatus ?? 'unknown'}
            </li>
            <li>
              {text.lastSnapshot}:{' '}
              {formatDateTime(summary?.runtime.lastStatsSnapshotAt ?? null, text.snapshotFallback, locale)}
            </li>
            <li>{summary?.message ?? text.loadingSummary}</li>
          </ul>
        </SectionCard>

        <SectionCard title={text.operationsTitle}>
          <ul className="feature-list">
            <li>{text.refreshSessions}</li>
            <li>{text.controlApi}</li>
            <li>
              {text.lastSync}:{' '}
              {formatDateTime(summary?.runtime.lastConfigSyncAt ?? null, text.syncFallback, locale)}
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
