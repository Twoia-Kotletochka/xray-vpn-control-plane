import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { ui } from '../../i18n';

export function LogsPage() {
  return (
    <div className="page">
      <PageHeader title={ui.logs.title} description={ui.logs.description} />

      <SectionCard title={ui.logs.directionTitle}>
        <ul className="feature-list">
          {ui.logs.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
