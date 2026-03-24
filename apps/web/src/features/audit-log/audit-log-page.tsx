import { useEffect, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import type { AuditLogResponse } from '../../lib/api-types';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

export function AuditLogPage() {
  const { apiFetch } = useAuth();
  const [response, setResponse] = useState<AuditLogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadAudit = async () => {
      try {
        const nextResponse = await apiFetch<AuditLogResponse>('/api/audit-log?page=1&pageSize=20');

        if (isMounted) {
          setResponse(nextResponse);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить аудит.');
        }
      }
    };

    void loadAudit();

    return () => {
      isMounted = false;
    };
  }, [apiFetch]);

  return (
    <div className="page">
      <PageHeader
        title="Аудит"
        description="Журнал действий администратора и критичных событий по клиентам и платформе."
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <SectionCard title="Последние события">
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Событие</th>
                <th>Описание</th>
              </tr>
            </thead>
            <tbody>
              {response?.items.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>{item.action}</td>
                  <td>{item.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
