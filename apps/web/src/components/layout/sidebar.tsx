import { Shield, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useNavigationSections } from '../../app/navigation';
import { useI18n } from '../../i18n';

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const navigationSections = useNavigationSections();
  const { ui } = useI18n();

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar__header">
        <div className="sidebar__brand">
          <div className="sidebar__logo">
            <Shield size={18} />
          </div>
          <div>
            <p className="sidebar__eyebrow">{ui.common.operationsConsole}</p>
            <h1>server-vpn</h1>
          </div>
        </div>
        <button
          className="icon-button sidebar__close"
          type="button"
          aria-label={ui.common.closeNavigation}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      <div className="sidebar__nav">
        {navigationSections.map((section) => (
          <nav key={section.id} className="sidebar__section" aria-label={section.label}>
            <p className="sidebar__section-label">{section.label}</p>
            <div className="sidebar__section-links">
              {section.items.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
                    }
                    onClick={onClose}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </nav>
        ))}
      </div>

      <div className="sidebar__footer">
        <p>{ui.common.transportProfile}</p>
        <strong>VLESS + REALITY</strong>
        <span>{ui.common.fixedControlPlane}</span>
      </div>
    </aside>
  );
}
