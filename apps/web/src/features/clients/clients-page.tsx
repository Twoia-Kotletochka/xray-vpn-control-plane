import { MoreHorizontal, Plus, QrCode, RotateCcw, Search } from 'lucide-react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { StatusPill } from '../../components/ui/status-pill';
import { formatBytes } from '../../lib/format';

const rows = [
  {
    id: 'draft',
    name: 'Waiting for backend core',
    status: 'Draft MVP',
    traffic: formatBytes(0),
    expiresAt: 'Not scheduled',
  },
];

export function ClientsPage() {
  return (
    <div className="page">
      <PageHeader
        title="Clients"
        description="Searchable client management with quick actions for expiry, limits, QR export, and safe suspensions."
        actionLabel="New client"
      />

      <SectionCard
        title="Client Registry"
        subtitle="The table layout, filters, and action density are already shaped for a Marzban-class operator workflow."
      >
        <div className="toolbar">
          <label className="toolbar__search">
            <Search size={16} />
            <input placeholder="Find by name, tag, UUID, note" />
          </label>

          <div className="toolbar__actions">
            <button className="button" type="button">
              <RotateCcw size={16} />
              Reset filters
            </button>
            <button className="button button--primary" type="button">
              <Plus size={16} />
              Add client
            </button>
          </div>
        </div>

        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Traffic</th>
                <th>Expiry</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="table-main">
                      <strong>{row.name}</strong>
                      <span>{row.id}</span>
                    </div>
                  </td>
                  <td>
                    <StatusPill tone="muted">{row.status}</StatusPill>
                  </td>
                  <td>{row.traffic}</td>
                  <td>{row.expiresAt}</td>
                  <td>
                    <div className="table-actions">
                      <button className="icon-button" type="button" aria-label="Show QR">
                        <QrCode size={16} />
                      </button>
                      <button className="icon-button" type="button" aria-label="More actions">
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
