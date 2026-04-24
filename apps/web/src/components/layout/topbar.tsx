import { LogOut, Menu, Search } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useNavigationItems } from '../../app/navigation';
import { useAuth } from '../../features/auth/auth-context';
import { useI18n } from '../../i18n';

type TopbarProps = {
  onOpenNavigation: () => void;
};

export function Topbar({ onOpenNavigation }: TopbarProps) {
  const { ui } = useI18n();
  const { logout } = useAuth();
  const navigationItems = useNavigationItems();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const activeItem = useMemo(
    () => navigationItems.find((item) => location.pathname.startsWith(item.path)),
    [location.pathname, navigationItems],
  );
  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      navigate('/clients');
      return;
    }

    const matchedNavigationItem = navigationItems.find((item) => {
      const haystack = [item.label, item.path, ...item.keywords].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    if (matchedNavigationItem) {
      navigate(matchedNavigationItem.path);
      return;
    }

    navigate(`/clients?search=${encodeURIComponent(query.trim())}`);
  };

  return (
    <header className="topbar">
      <div className="topbar__identity">
        <button
          className="icon-button topbar__menu"
          type="button"
          aria-label={ui.common.openNavigation}
          onClick={onOpenNavigation}
        >
          <Menu size={16} />
        </button>
        <div>
          <span className="topbar__eyebrow">{ui.common.protectedAccess}</span>
          <strong>{activeItem?.label ?? 'VPN'}</strong>
        </div>
      </div>

      <form className="topbar__search" onSubmit={handleSearch}>
        <Search size={16} />
        <input
          placeholder={ui.common.globalSearchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>
      <div className="topbar__actions">
        <button
          className="button button--ghost topbar__logout"
          type="button"
          aria-label={ui.common.logout}
          onClick={() => {
            void logout();
          }}
        >
          <LogOut size={16} />
          <span className="topbar__quick-action-label">{ui.common.logout}</span>
        </button>
      </div>
    </header>
  );
}
