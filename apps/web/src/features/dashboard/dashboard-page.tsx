import { useEffect, useState } from 'react';

import { MetricCard } from '../../components/ui/metric-card';
import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import type { DashboardSummary } from '../../lib/api-types';
import { formatBytes, formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

function formatPercent(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

export function DashboardPage() {
  const { apiFetch } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          setError(
            loadError instanceof Error ? loadError.message : 'Не удалось загрузить дашборд.',
          );
        }
      }
    };

    void loadSummary();

    return () => {
      isMounted = false;
    };
  }, [apiFetch]);

  const metrics = [
    {
      label: 'Активные клиенты',
      value: String(summary?.totals.active ?? 0),
      hint: 'текущее количество доступных клиентов',
    },
    {
      label: 'Истекшие клиенты',
      value: String(summary?.totals.expired ?? 0),
      hint: 'автоматически обновляется по сроку действия',
    },
    {
      label: 'Суммарный трафик',
      value: formatBytes(Number(summary?.totals.totalTrafficBytes ?? '0')),
      hint: 'агрегировано по daily usage buckets',
    },
    {
      label: 'Всего клиентов',
      value: String(summary?.totals.clients ?? 0),
      hint: 'активные, истекшие, отключенные и заблокированные',
    },
    {
      label: 'CPU',
      value: formatPercent(summary?.host.cpuPercent ?? null),
      hint: 'приблизительная текущая загрузка окружения',
    },
    {
      label: 'RAM',
      value: formatPercent(summary?.host.ramPercent ?? null),
      hint: 'использование памяти по данным рантайма',
    },
    {
      label: 'Disk',
      value: formatPercent(summary?.host.diskPercent ?? null),
      hint: 'доступная ёмкость файловой системы контейнера',
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Дашборд"
        description="Операционная сводка по клиентской базе, трафику, runtime Xray и состоянию сервисов."
        actionLabel="Обновить"
        onAction={() => {
          void apiFetch<DashboardSummary>('/api/dashboard/summary')
            .then((nextSummary) => {
              setSummary(nextSummary);
              setError(null);
            })
            .catch((loadError) => {
              setError(
                loadError instanceof Error ? loadError.message : 'Не удалось загрузить дашборд.',
              );
            });
        }}
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <div className="metrics-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="content-grid">
        <SectionCard title="Текущая сводка">
          <ul className="feature-list">
            <li>Отключенных клиентов: {summary?.totals.disabled ?? 0}</li>
            <li>Заблокированных клиентов: {summary?.totals.blocked ?? 0}</li>
            <li>Онлайн пользователей в Xray: {summary?.runtime.onlineUsers ?? 0}</li>
            <li>Статус Xray control API: {summary?.runtime.xrayStatus ?? 'unknown'}</li>
            <li>
              Последний snapshot трафика:{' '}
              {formatDateTime(summary?.runtime.lastStatsSnapshotAt ?? null, 'ещё не выполнялся')}
            </li>
            <li>{summary?.message ?? 'Загрузка сводки из PostgreSQL...'}</li>
          </ul>
        </SectionCard>

        <SectionCard title="Операционный контур">
          <ul className="feature-list">
            <li>Администратор работает через refresh-сессии и журнал аудита.</li>
            <li>Клиенты синхронизируются с Xray через control API без доступа приложения к docker.sock.</li>
            <li>
              Последняя успешная синхронизация Xray:{' '}
              {formatDateTime(summary?.runtime.lastConfigSyncAt ?? null, 'ещё не выполнялась')}
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
