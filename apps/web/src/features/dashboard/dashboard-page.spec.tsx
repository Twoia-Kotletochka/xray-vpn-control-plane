// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardSummary } from '../../lib/api-types';
import { DashboardPage } from './dashboard-page';

const mockApiFetch = vi.fn();

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    admin: {
      role: 'SUPER_ADMIN',
    },
    apiFetch: mockApiFetch,
  }),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('shows the operational overview and runtime state', async () => {
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
            incomingTrafficBytes: '1024',
            outgoingTrafficBytes: '1024',
            totalTrafficBytes: '2048',
            activeClients: 1,
          },
          {
            date: '2026-04-01T00:00:00.000Z',
            incomingTrafficBytes: '2048',
            outgoingTrafficBytes: '2048',
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

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await screen.findByText('Пульс трафика');
    expect(screen.getByText('Активные профили')).toBeTruthy();
    expect(screen.getByText('Состояние runtime')).toBeTruthy();
    expect(screen.getByText('Дельта тренда')).toBeTruthy();
    expect(screen.getByText('Клиентов замечено: 1')).toBeTruthy();
    expect(screen.queryByText('live-подключения по данным Xray runtime')).toBeNull();
    expect(screen.queryByText('Рабочие разделы')).toBeNull();
  });
});
