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

  it('shows separate cards for online and available clients with traffic trends', async () => {
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
      trends: {
        windowDays: 14,
        comparisonWindowDays: 7,
        buckets: [
          {
            date: '2026-03-31T00:00:00.000Z',
            totalTrafficBytes: '2048',
            activeClients: 1,
          },
          {
            date: '2026-04-01T00:00:00.000Z',
            totalTrafficBytes: '4096',
            activeClients: 2,
          },
        ],
        comparisons: {
          last7DaysTrafficBytes: '6144',
          previous7DaysTrafficBytes: '3072',
          trafficDeltaPercent: 100,
          averageDailyTrafficBytes: '438',
          busiestDayDate: '2026-04-01T00:00:00.000Z',
          busiestDayTrafficBytes: '4096',
          activeClientsToday: 2,
          peakActiveClients: 2,
        },
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
    expect(screen.getByText('Активные профили')).toBeTruthy();
    expect(screen.getByText('реальные live-подключения по данным Xray runtime')).toBeTruthy();
    expect(screen.getByText('клиенты со статусом ACTIVE, готовые к подключению')).toBeTruthy();
    expect(screen.getByText('Клиентов онлайн сейчас: 2')).toBeTruthy();
    expect(screen.getByText('Активные профили: 6')).toBeTruthy();
    expect(screen.getByText('Тренды нагрузки')).toBeTruthy();
    expect(screen.getByText('Последние 7 дней')).toBeTruthy();
    expect(screen.getByText('Замечено онлайн сегодня')).toBeTruthy();
    expect(screen.getByText('Клиентов замечено онлайн: 2')).toBeTruthy();
  });
});
