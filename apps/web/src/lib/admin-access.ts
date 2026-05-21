import type { AuthAdminRecord } from './api-types';

type AdminRole = AuthAdminRecord['role'] | null | undefined;

const SUPER_ADMIN_ONLY_PATHS = ['/audit-log', '/backups', '/logs', '/server-status', '/settings'];

export function isSuperAdminRole(role: AdminRole) {
  return role === 'SUPER_ADMIN';
}

export function isReadOnlyRole(role: AdminRole) {
  return role === 'READ_ONLY';
}

export function canManageClientsRole(role: AdminRole) {
  return role === 'SUPER_ADMIN' || role === 'OPERATOR';
}

export function canViewInfrastructureRole(role: AdminRole) {
  return role === 'SUPER_ADMIN';
}

export function canImportOrExportClients(role: AdminRole) {
  return role === 'SUPER_ADMIN';
}

export function canAccessPath(role: AdminRole, pathname: string) {
  return (
    !SUPER_ADMIN_ONLY_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    isSuperAdminRole(role)
  );
}

export function resolveProtectedFallbackPath(role: AdminRole) {
  return canAccessPath(role, '/dashboard') ? '/dashboard' : '/clients';
}
