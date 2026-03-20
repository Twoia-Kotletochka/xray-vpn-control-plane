import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';

export function AdminUsersPage() {
  return (
    <div className="page">
      <PageHeader
        title="Admin Users"
        description="Role-based admin access with auditability is part of the MVP foundation, even before 2FA is enabled."
      />

      <SectionCard title="Planned Access Model">
        <ul className="feature-list">
          <li>Super admin, operator, and read-only roles.</li>
          <li>Revocable refresh sessions per device/browser.</li>
          <li>Reserved schema support for future TOTP rollout.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
