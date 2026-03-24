import { Navigate } from 'react-router-dom';

import { AppShell } from '../components/layout/app-shell';
import { useAuth } from '../features/auth/auth-context';
import { ui } from '../i18n';

export function ProtectedShell() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <main className="login-page">
        <section className="login-panel">
          <p className="page-header__eyebrow">{ui.common.operations}</p>
          <h1>server-vpn</h1>
          <p>Проверяем активную сессию администратора.</p>
        </section>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate replace to="/login" />;
  }

  return <AppShell />;
}
