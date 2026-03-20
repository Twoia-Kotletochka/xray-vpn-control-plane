import { useEffect, useState } from 'react';

import { MetricCard } from '../../components/ui/metric-card';
import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import type { DashboardSummary } from '../../lib/api-types';
import { formatBytes } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

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
  ];

  return (
    <div className="page">
      <PageHeader
        title="Дашборд"
        description="Живой обзор клиентской базы, трафика и общего состояния панели управления."
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
            <li>{summary?.message ?? 'Загрузка сводки из PostgreSQL...'}</li>
          </ul>
        </SectionCard>

        <SectionCard title="Контрольный фокус релиза">
          <ul className="feature-list">
            <li>Аутентификация администратора уже переведена на реальные refresh-сессии.</li>
            <li>Управление клиентами и подписками теперь идёт через PostgreSQL и API.</li>
            <li>
              Следующий операционный шаг — live-sync конфигурации Xray и системные метрики хоста.
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
