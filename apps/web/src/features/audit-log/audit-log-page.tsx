import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';

export function AuditLogPage() {
  return (
    <div className="page">
      <PageHeader
        title="Audit Log"
        description="High-signal operator actions will be visible and searchable without turning the UI into a noisy SIEM."
      />

      <SectionCard title="Tracked Events">
        <ul className="feature-list">
          <li>Login success and failure.</li>
          <li>Client creation, updates, suspension, deletion, and resets.</li>
          <li>Backup, restore, Xray reload, and settings changes.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
