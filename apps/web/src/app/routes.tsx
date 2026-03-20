import { Navigate, createBrowserRouter } from 'react-router-dom';

import { AdminUsersPage } from '../features/admin-users/admin-users-page';
import { AuditLogPage } from '../features/audit-log/audit-log-page';
import { LoginPage } from '../features/auth/login-page';
import { BackupsPage } from '../features/backups/backups-page';
import { ClientsPage } from '../features/clients/clients-page';
import { DashboardPage } from '../features/dashboard/dashboard-page';
import { LogsPage } from '../features/logs/logs-page';
import { SettingsPage } from '../features/settings/settings-page';
import { SubscriptionsPage } from '../features/subscriptions/subscriptions-page';
import { ServerStatusPage } from '../features/system/server-status-page';
import { ProtectedShell } from './protected-shell';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <ProtectedShell />,
    children: [
      {
        index: true,
        element: <Navigate replace to="/dashboard" />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'clients',
        element: <ClientsPage />,
      },
      {
        path: 'subscriptions',
        element: <SubscriptionsPage />,
      },
      {
        path: 'server-status',
        element: <ServerStatusPage />,
      },
      {
        path: 'logs',
        element: <LogsPage />,
      },
      {
        path: 'backups',
        element: <BackupsPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: 'admin-users',
        element: <AdminUsersPage />,
      },
      {
        path: 'audit-log',
        element: <AuditLogPage />,
      },
      {
        path: '*',
        element: <Navigate replace to="/dashboard" />,
      },
    ],
  },
]);
