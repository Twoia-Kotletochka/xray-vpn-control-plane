import {
  Activity,
  ArchiveRestore,
  Cable,
  FileText,
  Gauge,
  KeyRound,
  Logs,
  ServerCog,
  ShieldUser,
} from 'lucide-react';

export const navigationItems = [
  { label: 'Dashboard', path: '/dashboard', icon: Gauge },
  { label: 'Clients', path: '/clients', icon: Cable },
  { label: 'Subscriptions', path: '/subscriptions', icon: KeyRound },
  { label: 'Server Status', path: '/server-status', icon: Activity },
  { label: 'Logs', path: '/logs', icon: Logs },
  { label: 'Backups', path: '/backups', icon: ArchiveRestore },
  { label: 'Settings', path: '/settings', icon: ServerCog },
  { label: 'Admin Users', path: '/admin-users', icon: ShieldUser },
  { label: 'Audit Log', path: '/audit-log', icon: FileText },
] as const;
