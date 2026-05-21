import { Navigate, useLocation } from 'react-router-dom';

import { AppShell } from '../components/layout/app-shell';
import { useAuth } from '../features/auth/auth-context';
import { useI18n } from '../i18n';
import { canAccessPath, resolveProtectedFallbackPath } from '../lib/admin-access';

export function ProtectedShell() {
  const { admin, status } = useAuth();
  const { ui } = useI18n();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <main className="login-page">
        <section className="login-panel">
          <p className="page-header__eyebrow">{ui.common.operations}</p>
          <h1>VPN</h1>
          <p>{ui.common.checkingSession}</p>
        </section>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate replace to="/login" />;
  }

  if (!canAccessPath(admin?.role, location.pathname)) {
    return <Navigate replace to={resolveProtectedFallbackPath(admin?.role)} />;
  }

  return <AppShell />;
}
