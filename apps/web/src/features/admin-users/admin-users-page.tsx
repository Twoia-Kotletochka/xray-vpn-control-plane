import { useEffect, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { StatusPill } from '../../components/ui/status-pill';
import type { AdminUsersResponse } from '../../lib/api-types';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

export function AdminUsersPage() {
  const { apiFetch } = useAuth();
  const [response, setResponse] = useState<AdminUsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadAdmins = async () => {
      try {
        const nextResponse = await apiFetch<AdminUsersResponse>('/api/admin-users');

        if (isMounted) {
          setResponse(nextResponse);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Не удалось загрузить администраторов.',
          );
        }
      }
    };

    void loadAdmins();

    return () => {
      isMounted = false;
    };
  }, [apiFetch]);

  return (
    <div className="page">
      <PageHeader
        title="Администраторы"
        description="Ролевой доступ, активные админы и основа под будущую 2FA уже заведены в модели данных."
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <SectionCard title="Список администраторов">
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Создан</th>
              </tr>
            </thead>
            <tbody>
              {response?.items.map((admin) => (
                <tr key={admin.id}>
                  <td>
                    <div className="table-main">
                      <strong>{admin.username}</strong>
                      <span>{admin.email}</span>
                    </div>
                  </td>
                  <td>{admin.role}</td>
                  <td>
                    <StatusPill tone={admin.isActive ? 'success' : 'muted'}>
                      {admin.isActive ? 'Активен' : 'Отключен'}
                    </StatusPill>
                  </td>
                  <td>{formatDateTime(admin.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
