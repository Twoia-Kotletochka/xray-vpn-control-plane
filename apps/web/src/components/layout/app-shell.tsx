import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isSidebarOpen]);

  return (
    <div className={`app-shell ${isSidebarOpen ? 'app-shell--nav-open' : ''}`}>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      {isSidebarOpen ? (
        <button
          className="app-shell__overlay"
          type="button"
          aria-label="Закрыть навигацию"
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
