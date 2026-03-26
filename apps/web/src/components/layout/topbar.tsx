import { Menu, ShieldCheck } from 'lucide-react';

import { useAuth } from '../../features/auth/auth-context';
import { useI18n } from '../../i18n';
import { LanguageSwitch } from '../ui/language-switch';

type TopbarProps = {
  onOpenNavigation: () => void;
};

export function Topbar({ onOpenNavigation }: TopbarProps) {
  const { admin, logout } = useAuth();
  const { ui } = useI18n();

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
          <strong>{admin?.username ?? 'admin'}</strong>
        </div>
      </div>

      <div className="topbar__actions">
        <LanguageSwitch />
        <div className="topbar__chip">
          <ShieldCheck size={16} />
          <span>{ui.common.protectedAccess}</span>
        </div>
        <button className="button" type="button" onClick={() => void logout()}>
          {ui.common.logout}
        </button>
      </div>
    </header>
  );
}
