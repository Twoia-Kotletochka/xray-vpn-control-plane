import {
  Activity,
  ArchiveRestore,
  Cable,
  CircleHelp,
  FileText,
  Gauge,
  KeyRound,
  Logs,
  ShieldUser,
} from 'lucide-react';

import { useI18n } from '../i18n';

export function useNavigationItems() {
  const { ui } = useI18n();

  return [
    { label: ui.navigation.dashboard, path: '/dashboard', icon: Gauge },
    { label: ui.navigation.clients, path: '/clients', icon: Cable },
    { label: ui.navigation.subscriptions, path: '/subscriptions', icon: KeyRound },
    { label: ui.navigation.serverStatus, path: '/server-status', icon: Activity },
    { label: ui.navigation.logs, path: '/logs', icon: Logs },
    { label: ui.navigation.backups, path: '/backups', icon: ArchiveRestore },
    { label: ui.navigation.help, path: '/help', icon: CircleHelp },
    { label: ui.navigation.adminUsers, path: '/admin-users', icon: ShieldUser },
    { label: ui.navigation.auditLog, path: '/audit-log', icon: FileText },
  ] as const;
}
