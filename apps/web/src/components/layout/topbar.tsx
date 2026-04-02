import { Menu, Plus, Search, ShieldCheck } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useNavigationItems } from '../../app/navigation';
import { useAuth } from '../../features/auth/auth-context';
import { useI18n } from '../../i18n';
import { LanguageSwitch } from '../ui/language-switch';

type TopbarProps = {
  onOpenNavigation: () => void;
};

export function Topbar({ onOpenNavigation }: TopbarProps) {
  const { admin, logout } = useAuth();
  const { locale, ui } = useI18n();
  const navigationItems = useNavigationItems();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const activeItem = useMemo(
    () => navigationItems.find((item) => location.pathname.startsWith(item.path)),
    [location.pathname, navigationItems],
  );
  const roleLabel =
    admin?.role === 'READ_ONLY'
      ? locale === 'en'
        ? 'Read-only'
        : 'Только чтение'
      : admin?.role === 'OPERATOR'
        ? locale === 'en'
          ? 'Operator'
          : 'Оператор'
        : locale === 'en'
          ? 'Super admin'
          : 'Супер-админ';

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
          <strong>{activeItem?.label ?? 'server-vpn'}</strong>
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
        {admin?.role !== 'READ_ONLY' ? (
          <button
            className="button button--primary topbar__quick-action"
            type="button"
            onClick={() => navigate('/clients?composer=1')}
          >
            <Plus size={16} />
            {ui.clients.actionLabel}
          </button>
        ) : null}
        <LanguageSwitch />
        <div className="topbar__chip">
          <ShieldCheck size={16} />
          <div>
            <strong>{admin?.username ?? 'admin'}</strong>
            <span>{roleLabel}</span>
          </div>
        </div>
        <button className="button button--ghost" type="button" onClick={() => void logout()}>
          {ui.common.logout}
        </button>
      </div>
    </header>
  );
}
