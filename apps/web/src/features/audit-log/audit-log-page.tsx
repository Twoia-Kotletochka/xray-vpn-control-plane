import { useEffect, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { useI18n } from '../../i18n';
import type { AuditLogResponse } from '../../lib/api-types';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

export function AuditLogPage() {
  const { apiFetch } = useAuth();
  const { locale, ui } = useI18n();
  const [response, setResponse] = useState<AuditLogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text =
    locale === 'en'
      ? {
          loadError: 'Failed to load the audit log.',
          description: 'Administrator actions and critical client or platform events.',
          eventsTitle: 'Recent events',
          time: 'Time',
          event: 'Event',
          descriptionColumn: 'Description',
          notSet: 'Not set',
        }
      : {
          loadError: 'Не удалось загрузить аудит.',
          description: 'Журнал действий администратора и критичных событий по клиентам и платформе.',
          eventsTitle: 'Последние события',
          time: 'Время',
          event: 'Событие',
          descriptionColumn: 'Описание',
          notSet: 'Не задано',
        };

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
          setError(loadError instanceof Error ? loadError.message : text.loadError);
        }
      }
    };

    void loadAudit();

    return () => {
      isMounted = false;
    };
  }, [apiFetch, text.loadError]);

  return (
    <div className="page">
      <PageHeader title={ui.auditLog.title} description={text.description} />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <SectionCard title={text.eventsTitle}>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>{text.time}</th>
                <th>{text.event}</th>
                <th>{text.descriptionColumn}</th>
              </tr>
            </thead>
            <tbody>
              {response?.items.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.createdAt, text.notSet, locale)}</td>
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
