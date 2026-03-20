import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';

export function SubscriptionsPage() {
  return (
    <div className="page">
      <PageHeader
        title="Subscriptions"
        description="Template-aware config delivery for the major VLESS/Xray clients on desktop and mobile."
      />

      <SectionCard
        title="Planned Output Types"
        subtitle="The backend will generate per-client links, QR payloads, and subscription feeds from transport templates."
      >
        <ul className="feature-list">
          <li>VLESS link export with deterministic naming.</li>
          <li>Subscription URL per client with revocable token.</li>
          <li>Connection walkthroughs for Windows, macOS, Android, and iPhone/iPad.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
