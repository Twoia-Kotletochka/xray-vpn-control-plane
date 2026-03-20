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

import { ui } from '../i18n';

export const navigationItems = [
  { label: ui.navigation.dashboard, path: '/dashboard', icon: Gauge },
  { label: ui.navigation.clients, path: '/clients', icon: Cable },
  { label: ui.navigation.subscriptions, path: '/subscriptions', icon: KeyRound },
  { label: ui.navigation.serverStatus, path: '/server-status', icon: Activity },
  { label: ui.navigation.logs, path: '/logs', icon: Logs },
  { label: ui.navigation.backups, path: '/backups', icon: ArchiveRestore },
  { label: ui.navigation.settings, path: '/settings', icon: ServerCog },
  { label: ui.navigation.adminUsers, path: '/admin-users', icon: ShieldUser },
  { label: ui.navigation.auditLog, path: '/audit-log', icon: FileText },
] as const;
