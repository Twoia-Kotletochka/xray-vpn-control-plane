import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { StatusPill } from '../../components/ui/status-pill';

export function ServerStatusPage() {
  return (
    <div className="page">
      <PageHeader
        title="Server Status"
        description="A dedicated place for Xray, API, database, disk, RAM, CPU, and controlled restart actions."
      />

      <div className="content-grid">
        <SectionCard title="Service Health">
          <div className="status-list">
            <div className="status-row">
              <span>API</span>
              <StatusPill tone="success">Ready for health checks</StatusPill>
            </div>
            <div className="status-row">
              <span>Xray</span>
              <StatusPill tone="warning">Pending runtime probe</StatusPill>
            </div>
            <div className="status-row">
              <span>PostgreSQL</span>
              <StatusPill tone="warning">Pending container startup</StatusPill>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Operational Intent">
          <ul className="feature-list">
            <li>Safe service restart buttons guarded by audit logs.</li>
            <li>Readable health states without exposing raw internals by default.</li>
            <li>A single page for both operator confidence and incident triage.</li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
