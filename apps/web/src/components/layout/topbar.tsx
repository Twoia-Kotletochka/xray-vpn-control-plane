import { Menu, ShieldCheck } from 'lucide-react';

import { useAuth } from '../../features/auth/auth-context';
import { ui } from '../../i18n';

type TopbarProps = {
  onOpenNavigation: () => void;
};

export function Topbar({ onOpenNavigation }: TopbarProps) {
  const { admin, logout } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar__identity">
        <button
          className="icon-button topbar__menu"
          type="button"
          aria-label="Открыть навигацию"
          onClick={onOpenNavigation}
        >
          <Menu size={16} />
        </button>
        <div>
          <span className="topbar__eyebrow">{ui.common.protectedAccess}</span>
          <strong>{admin?.username ?? 'admin'}</strong>
        </div>
      </div>

      <div className="topbar__actions">
        <div className="topbar__chip">
          <ShieldCheck size={16} />
          <span>{ui.common.protectedAccess}</span>
        </div>
        <button className="button" type="button" onClick={() => void logout()}>
          Выйти
        </button>
      </div>
    </header>
  );
}
