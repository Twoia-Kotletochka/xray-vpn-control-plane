import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';

export function SettingsPage() {
  return (
    <div className="page">
      <PageHeader
        title="Settings"
        description="Platform settings will stay narrow, explicit, and safe to change on a live single-node system."
      />

      <SectionCard title="Settings Scope">
        <ul className="feature-list">
          <li>Transport profile defaults and public host parameters.</li>
          <li>Panel security posture and session timings.</li>
          <li>Backup retention and optional notification integrations.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
