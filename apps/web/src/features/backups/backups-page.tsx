import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { ui } from '../../i18n';

export function BackupsPage() {
  return (
    <div className="page">
      <PageHeader title={ui.backups.title} description={ui.backups.description} />

      <SectionCard title={ui.backups.designTitle}>
        <ul className="feature-list">
          {ui.backups.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
