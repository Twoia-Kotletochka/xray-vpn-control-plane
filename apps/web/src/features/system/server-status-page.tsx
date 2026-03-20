import { useEffect, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { StatusPill } from '../../components/ui/status-pill';
import type { SystemStatusResponse } from '../../lib/api-types';
import { useAuth } from '../auth/auth-context';

function serviceTone(status: string) {
  if (status === 'up' || status === 'healthy') {
    return 'success' as const;
  }

  if (status === 'unknown') {
    return 'warning' as const;
  }

  return 'muted' as const;
}

export function ServerStatusPage() {
  const { apiFetch } = useAuth();
  const [response, setResponse] = useState<SystemStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadStatus = async () => {
      try {
        const nextResponse = await apiFetch<SystemStatusResponse>('/api/system/status');

        if (isMounted) {
          setResponse(nextResponse);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : 'Не удалось загрузить статус системы.',
          );
        }
      }
    };

    void loadStatus();

    return () => {
      isMounted = false;
    };
  }, [apiFetch]);

  return (
    <div className="page">
      <PageHeader
        title="Состояние сервера"
        description="Текущие сигналы по основным сервисам платформы и общее пояснение по состоянию окружения."
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <div className="content-grid">
        <SectionCard title="Сервисы">
          <div className="status-list">
            {response?.services.map((service) => (
              <div key={service.name} className="status-row">
                <span>{service.name}</span>
                <StatusPill tone={serviceTone(service.status)}>{service.status}</StatusPill>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Комментарий системы">
          <ul className="feature-list">
            <li>{response?.message ?? 'Собираем состояние сервисов...'}</li>
            <li>Хостовые CPU/RAM/disk probe будут добавлены в отдельном изолированном шаге.</li>
            <li>Безопасные действия рестарта будут завязаны на audit log и health-check gates.</li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
