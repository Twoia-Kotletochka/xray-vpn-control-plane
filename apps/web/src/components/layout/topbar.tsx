import { BellDot, Search, ShieldCheck } from 'lucide-react';

import { useAuth } from '../../features/auth/auth-context';
import { ui } from '../../i18n';

export function Topbar() {
  const { admin, logout } = useAuth();

  return (
    <header className="topbar">
      <label className="topbar__search">
        <Search size={16} />
        <input placeholder={ui.common.globalSearchPlaceholder} />
      </label>

      <div className="topbar__actions">
        {admin ? <div className="topbar__chip">{admin.username}</div> : null}
        <div className="topbar__chip">
          <ShieldCheck size={16} />
          <span>{ui.common.strictMode}</span>
        </div>
        <button className="icon-button" type="button" aria-label={ui.common.notifications}>
          <BellDot size={16} />
        </button>
        <button className="button" type="button" onClick={() => void logout()}>
          Выйти
        </button>
      </div>
    </header>
  );
}
