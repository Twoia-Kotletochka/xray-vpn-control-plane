import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';

export function LogsPage() {
  return (
    <div className="page">
      <PageHeader
        title="Logs"
        description="Planned operator-friendly views for API events, Xray errors, and filtered system diagnostics."
      />

      <SectionCard title="Log UX Direction">
        <ul className="feature-list">
          <li>Structured log stream with level filters.</li>
          <li>Short retention in-app, long retention in rotated host files.</li>
          <li>Fast pivot from a client record to related system events.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
