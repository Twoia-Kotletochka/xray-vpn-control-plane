import {
  Activity,
  ArchiveRestore,
  BarChart3,
  Cable,
  CircleHelp,
  FileText,
  Gauge,
  KeyRound,
  type LucideIcon,
  Logs,
  Settings2,
  ShieldUser,
} from 'lucide-react';

import { useI18n } from '../i18n';

export type NavigationItem = {
  keywords: string[];
  label: string;
  path: string;
  icon: LucideIcon;
};

export type NavigationSection = {
  id: string;
  label: string;
  items: NavigationItem[];
};

export function useNavigationSections(): NavigationSection[] {
  const { ui } = useI18n();

  return [
    {
      id: 'workspace',
      label: ui.common.workspaceGroup,
      items: [
        {
          label: ui.navigation.dashboard,
          path: '/dashboard',
          icon: Gauge,
          keywords: ['dashboard', 'overview', 'home', 'дашборд', 'главная'],
        },
        {
          label: ui.navigation.clients,
          path: '/clients',
          icon: Cable,
          keywords: ['clients', 'users', 'clients list', 'клиенты', 'пользователи'],
        },
        {
          label: ui.navigation.subscriptions,
          path: '/subscriptions',
          icon: KeyRound,
          keywords: ['connections', 'configs', 'subscriptions', 'подключения', 'конфиги'],
        },
        {
          label: ui.navigation.analytics,
          path: '/analytics',
          icon: BarChart3,
          keywords: ['traffic', 'analytics', 'usage', 'трафик', 'аналитика'],
        },
      ],
    },
    {
      id: 'platform',
      label: ui.common.platformGroup,
      items: [
        {
          label: ui.navigation.serverStatus,
          path: '/server-status',
          icon: Activity,
          keywords: ['system', 'status', 'health', 'система', 'статус'],
        },
        {
          label: ui.navigation.logs,
          path: '/logs',
          icon: Logs,
          keywords: ['logs', 'events', 'журнал', 'логи'],
        },
        {
          label: ui.navigation.backups,
          path: '/backups',
          icon: ArchiveRestore,
          keywords: ['backup', 'restore', 'резерв', 'backup'],
        },
        {
          label: ui.navigation.settings,
          path: '/settings',
          icon: Settings2,
          keywords: ['settings', 'preferences', 'config', 'настройки'],
        },
      ],
    },
    {
      id: 'access',
      label: ui.common.accessGroup,
      items: [
        {
          label: ui.navigation.adminUsers,
          path: '/admin-users',
          icon: ShieldUser,
          keywords: ['admins', 'operators', 'roles', 'админы', 'операторы'],
        },
        {
          label: ui.navigation.auditLog,
          path: '/audit-log',
          icon: FileText,
          keywords: ['audit', 'history', 'аудит', 'история'],
        },
        {
          label: ui.navigation.help,
          path: '/help',
          icon: CircleHelp,
          keywords: ['help', 'support', 'guide', 'помощь'],
        },
      ],
    },
  ];
}

export function useNavigationItems() {
  return useNavigationSections().flatMap((section) => section.items);
}
