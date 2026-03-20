import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { ui } from '../../i18n';

export function SettingsPage() {
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
