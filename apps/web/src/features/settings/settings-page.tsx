import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { useI18n } from '../../i18n';

export function SettingsPage() {
  const { ui } = useI18n();

  return (
    <div className="page">
      <PageHeader title={ui.settings.title} description={ui.settings.description} />

      <SectionCard title={ui.settings.scopeTitle}>
        <ul className="feature-list">
          {ui.settings.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
