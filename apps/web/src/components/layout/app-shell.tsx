import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useI18n } from '../../i18n';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { ui } = useI18n();
  const location = useLocation();
  const pathname = location.pathname;

  useEffect(() => {
    if (pathname.length > 0) {
      setIsSidebarOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!isSidebarOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSidebarOpen]);

  return (
    <div className={`app-shell ${isSidebarOpen ? 'app-shell--nav-open' : ''}`}>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      {isSidebarOpen ? (
        <button
          className="app-shell__overlay"
          type="button"
          aria-label={ui.common.closeNavigation}
          onClick={() => setIsSidebarOpen(false)}
        />
      ) : null}
      <div className="app-shell__content">
        <Topbar onOpenNavigation={() => setIsSidebarOpen(true)} />
        <main className="app-shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
