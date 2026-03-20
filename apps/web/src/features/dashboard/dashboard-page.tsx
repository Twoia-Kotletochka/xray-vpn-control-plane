import { MetricCard } from '../../components/ui/metric-card';
import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { formatBytes } from '../../lib/format';

const dashboardMetrics = [
  { label: 'Active Clients', value: '0', hint: 'ready for seeded data' },
  { label: 'Expired Clients', value: '0', hint: 'expiry engine not wired yet' },
  { label: 'Monthly Traffic', value: formatBytes(0), hint: 'daily rollups will land next' },
  { label: 'Host Load', value: 'N/A', hint: 'system probe pending' },
];

export function DashboardPage() {
  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        description="A clean operational surface for client lifecycle, server health, and traffic visibility."
        actionLabel="Create client"
      />

      <div className="metrics-grid">
        {dashboardMetrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="content-grid">
        <SectionCard
          title="Release Focus"
          subtitle="The first release optimizes for safe operations, clean data boundaries, and predictable Xray updates."
        >
          <ul className="feature-list">
            <li>Secure admin auth with refresh sessions and future 2FA support.</li>
            <li>Client limits, expiry policy, subscription generation, and audit logging.</li>
            <li>Host-aware health signals for API, database, Xray, and backups.</li>
          </ul>
        </SectionCard>

        <SectionCard
          title="Why Reality First"
          subtitle="The data plane stays simple and performant, while the panel can evolve independently."
        >
          <div className="insight-stack">
            <div className="insight-card">
              <span>Transport</span>
              <strong>VLESS + REALITY</strong>
            </div>
            <div className="insight-card">
              <span>Panel TLS</span>
              <strong>HTTPS on 8443</strong>
            </div>
            <div className="insight-card">
              <span>Persistence</span>
              <strong>PostgreSQL + Prisma</strong>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
