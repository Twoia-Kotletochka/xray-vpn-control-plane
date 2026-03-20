import { BellDot, Search, ShieldCheck } from 'lucide-react';

export function Topbar() {
  return (
    <header className="topbar">
      <label className="topbar__search">
        <Search size={16} />
        <input placeholder="Search clients, tags, audit actions" />
      </label>

      <div className="topbar__actions">
        <div className="topbar__chip">
          <ShieldCheck size={16} />
          <span>Strict mode</span>
        </div>
        <button className="icon-button" type="button" aria-label="Notifications">
          <BellDot size={16} />
        </button>
      </div>
    </header>
  );
}
