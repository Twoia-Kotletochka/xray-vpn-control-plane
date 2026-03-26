// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardSummary } from '../../lib/api-types';
import { DashboardPage } from './dashboard-page';

const mockApiFetch = vi.fn();

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    apiFetch: mockApiFetch,
  }),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('shows separate cards for online and available clients', async () => {
    const summary: DashboardSummary = {
      totals: {
        clients: 9,
        active: 6,
        available: 6,
        onlineNow: 2,
        expired: 1,
        disabled: 1,
        blocked: 0,
        totalTrafficBytes: '4096',
      },
      host: {
        cpuPercent: 12.5,
        ramPercent: 48.2,
        diskPercent: 63.1,
      },
      runtime: {
        lastConfigSyncAt: '2026-03-26T17:00:00.000Z',
        lastStatsSnapshotAt: '2026-03-26T17:05:00.000Z',
        onlineUsers: 2,
        xrayStatus: 'healthy',
      },
      message: 'dashboard payload',
    };

    mockApiFetch.mockResolvedValue(summary);

    render(<DashboardPage />);

    await screen.findByText('Онлайн сейчас');
    expect(screen.getByText('Доступные клиенты')).toBeTruthy();
    expect(screen.getByText('реальные live-подключения по данным Xray runtime')).toBeTruthy();
    expect(screen.getByText('клиенты со статусом ACTIVE, готовые к подключению')).toBeTruthy();
    expect(screen.getByText('Клиентов онлайн сейчас: 2')).toBeTruthy();
    expect(screen.getByText('Доступных клиентов: 6')).toBeTruthy();
  });
});
