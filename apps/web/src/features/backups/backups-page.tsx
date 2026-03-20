import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';

export function BackupsPage() {
  return (
    <div className="page">
      <PageHeader
        title="Backups"
        description="Database and rendered Xray state will be backed up together so restores stay consistent."
      />

      <SectionCard title="Restore Design">
        <ul className="feature-list">
          <li>Backup metadata persisted in PostgreSQL for visibility and auditability.</li>
          <li>
            Restore flow will validate checksum, unpack artifacts, and restart services in order.
          </li>
          <li>Retention policy remains operator-configurable and script-driven.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
