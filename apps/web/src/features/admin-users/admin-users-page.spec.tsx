// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminUsersResponse, TwoFactorStatusResponse } from '../../lib/api-types';
import { AdminUsersPage } from './admin-users-page';

const mockApiFetch = vi.fn();
const mockRefreshSession = vi.fn();
let mockAdmin = {
  id: 'admin-1',
  email: 'admin@example.com',
  username: 'admin',
  role: 'SUPER_ADMIN',
  twoFactorEnabled: false,
};

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    admin: mockAdmin,
    apiFetch: mockApiFetch,
    refreshSession: mockRefreshSession,
  }),
}));

describe('AdminUsersPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockApiFetch.mockReset();
    mockRefreshSession.mockReset();
    mockAdmin = {
      id: 'admin-1',
      email: 'admin@example.com',
      username: 'admin',
      role: 'SUPER_ADMIN',
      twoFactorEnabled: false,
    };
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  it('shows operator management controls for super admins', async () => {
    const response: AdminUsersResponse = {
      items: [
        {
          id: 'admin-1',
          email: 'admin@example.com',
          username: 'admin',
          role: 'SUPER_ADMIN',
          isActive: true,
          twoFactorEnabled: true,
          createdAt: '2026-03-26T17:00:00.000Z',
          updatedAt: '2026-03-26T17:00:00.000Z',
          isCurrentAdmin: true,
          canDelete: false,
        },
        {
          id: 'operator-1',
          email: 'operator@example.com',
          username: 'operator',
          role: 'OPERATOR',
          isActive: true,
          twoFactorEnabled: false,
          createdAt: '2026-03-26T17:05:00.000Z',
          updatedAt: '2026-03-26T17:05:00.000Z',
          isCurrentAdmin: false,
          canDelete: true,
        },
      ],
      total: 2,
      capabilities: {
        twoFactorReady: true,
        canManageAdmins: true,
        manageableRoles: ['OPERATOR'],
        roleModel: ['SUPER_ADMIN', 'OPERATOR', 'READ_ONLY'],
      },
    };
    const twoFactorStatus: TwoFactorStatusResponse = {
      enabled: false,
    };

    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/admin-users') {
        return response;
      }

      if (path === '/api/admin-users/me/two-factor') {
        return twoFactorStatus;
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(<AdminUsersPage />);

    await screen.findByText('Операторские аккаунты');
    expect(screen.getByRole('button', { name: 'Создать оператора' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Удалить operator' })).toBeTruthy();
    expect(screen.getByText('Супер-админ')).toBeTruthy();
    expect(screen.getByText('Оператор')).toBeTruthy();
  });

  it('hides operator management controls for non-super-admins', async () => {
    mockAdmin = {
      id: 'operator-1',
      email: 'operator@example.com',
      username: 'operator',
      role: 'OPERATOR',
      twoFactorEnabled: false,
    };

    const response: AdminUsersResponse = {
      items: [
        {
          id: 'operator-1',
          email: 'operator@example.com',
          username: 'operator',
          role: 'OPERATOR',
          isActive: true,
          twoFactorEnabled: false,
          createdAt: '2026-03-26T17:05:00.000Z',
          updatedAt: '2026-03-26T17:05:00.000Z',
          isCurrentAdmin: true,
          canDelete: false,
        },
      ],
      total: 1,
      capabilities: {
        twoFactorReady: true,
        canManageAdmins: false,
        manageableRoles: [],
        roleModel: ['SUPER_ADMIN', 'OPERATOR', 'READ_ONLY'],
      },
    };
    const twoFactorStatus: TwoFactorStatusResponse = {
      enabled: false,
    };

    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/admin-users') {
        return response;
      }

      if (path === '/api/admin-users/me/two-factor') {
        return twoFactorStatus;
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(<AdminUsersPage />);

    await screen.findByText('Список администраторов');
    expect(screen.queryByText('Операторские аккаунты')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Создать оператора' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Удалить /i })).toBeNull();
  });
});
