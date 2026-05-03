import { AdminRole, type Prisma } from '@prisma/client';

import type { AuthenticatedAdmin } from './authenticated-admin.interface';

type AdminLike = Pick<AuthenticatedAdmin, 'id' | 'role'> | null | undefined;

export function isSuperAdmin(admin: AdminLike) {
  return admin?.role === AdminRole.SUPER_ADMIN;
}

export function isOperator(admin: AdminLike) {
  return admin?.role === AdminRole.OPERATOR;
}

export function isReadOnlyAdmin(admin: AdminLike) {
  return admin?.role === AdminRole.READ_ONLY;
}

export function getScopedClientWhere(admin: AdminLike): Prisma.ClientWhereInput | null {
  if (!admin || !isOperator(admin)) {
    return null;
  }

  return {
    createdByAdminUserId: admin.id,
  };
}

export function canManageClient(admin: AdminLike, ownerAdminUserId: string | null) {
  if (!admin) {
    return true;
  }

  if (isSuperAdmin(admin)) {
    return true;
  }

  if (isReadOnlyAdmin(admin)) {
    return false;
  }

  return ownerAdminUserId === admin.id;
}

export function canViewSensitiveClientConfig(admin: AdminLike, ownerAdminUserId: string | null) {
  if (!admin) {
    return true;
  }

  if (isSuperAdmin(admin)) {
    return true;
  }

  if (isReadOnlyAdmin(admin)) {
    return false;
  }

  return ownerAdminUserId === admin.id;
}
