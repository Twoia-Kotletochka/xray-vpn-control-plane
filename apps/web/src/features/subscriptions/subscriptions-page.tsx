import { useEffect, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import type { SubscriptionTemplatesResponse } from '../../lib/api-types';
import { useAuth } from '../auth/auth-context';

export function SubscriptionsPage() {
  const { apiFetch } = useAuth();
  const [templates, setTemplates] = useState<SubscriptionTemplatesResponse['items']>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadTemplates = async () => {
      try {
        const response = await apiFetch<SubscriptionTemplatesResponse>(
          '/api/subscriptions/templates',
        );

        if (isMounted) {
          setTemplates(response.items);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : 'Не удалось загрузить шаблоны.',
          );
        }
      }
    };

    void loadTemplates();

    return () => {
      isMounted = false;
    };
  }, [apiFetch]);

  return (
    <div className="page">
      <PageHeader
        title="Подписки"
        description="Шаблоны доставки конфигов и подписок для VLESS + REALITY клиентов на desktop и mobile."
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <SectionCard
        title="Доступные шаблоны"
        subtitle="Текущий MVP стартует с production-профилем VLESS + REALITY."
      >
        <div className="detail-stack">
          {templates.map((template) => (
            <div key={template.id} className="insight-card">
              <span>{template.profile}</span>
              <strong>{template.platformTargets.join(', ')}</strong>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
