import { useEffect, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { useI18n } from '../../i18n';
import type { SubscriptionTemplatesResponse } from '../../lib/api-types';
import { useAuth } from '../auth/auth-context';

export function SubscriptionsPage() {
  const { apiFetch } = useAuth();
  const { locale, ui } = useI18n();
  const [templates, setTemplates] = useState<SubscriptionTemplatesResponse['items']>([]);
  const [error, setError] = useState<string | null>(null);
  const text =
    locale === 'en'
      ? {
          loadError: 'Failed to load subscription templates.',
          description:
            'Transport profile templates and delivery methods for supported client applications.',
          templatesTitle: 'Available templates',
          templatesSubtitle: 'Active transport profiles currently available for issuing from the panel.',
        }
      : {
          loadError: 'Не удалось загрузить шаблоны.',
          description:
            'Шаблоны транспортных профилей и способов выдачи конфигов для поддерживаемых клиентов.',
          templatesTitle: 'Доступные шаблоны',
          templatesSubtitle: 'Активные транспортные профили, доступные для выдачи из панели.',
        };

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
          setError(loadError instanceof Error ? loadError.message : text.loadError);
        }
      }
    };

    void loadTemplates();

    return () => {
      isMounted = false;
    };
  }, [apiFetch, text.loadError]);

  return (
    <div className="page">
      <PageHeader title={ui.subscriptions.title} description={text.description} />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <SectionCard title={text.templatesTitle} subtitle={text.templatesSubtitle}>
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
