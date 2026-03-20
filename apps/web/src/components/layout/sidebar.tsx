import { Shield } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { navigationItems } from '../../app/navigation';
import { ui } from '../../i18n';

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__logo">
          <Shield size={18} />
        </div>
        <div>
          <p className="sidebar__eyebrow">{ui.common.singleVpsControlPlane}</p>
          <h1>server-vpn</h1>
        </div>
      </div>

      <nav className="sidebar__nav">
        {navigationItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
              }
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <p>{ui.common.mvpProfile}</p>
        <strong>VLESS + REALITY</strong>
      </div>
    </aside>
  );
}
