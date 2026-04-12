// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardAnalyticsResponse, DashboardSummary } from '../../lib/api-types';
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
    const analytics: DashboardAnalyticsResponse = {
      generatedAt: '2026-04-02T10:15:00.000Z',
      availableWindows: [7, 14, 30],
      windowDays: 14,
      totals: {
        totalTrafficBytes: '32768',
        windowTrafficBytes: '16384',
        windowIncomingBytes: '9216',
        windowOutgoingBytes: '7168',
        averageDailyTrafficBytes: '1170',
        activeClientsToday: 2,
        peakActiveClients: 3,
        uniqueClientsWithTraffic: 2,
        onlineNow: 1,
        topClientDisplayName: 'Ann',
        topClientTrafficBytes: '12288',
        todayTrafficBytes: '4096',
      },
      timeline: [
        {
          date: '2026-04-01T00:00:00.000Z',
          incomingTrafficBytes: '2048',
          outgoingTrafficBytes: '1024',
          totalTrafficBytes: '3072',
          activeClients: 1,
        },
        {
          date: '2026-04-02T00:00:00.000Z',
          incomingTrafficBytes: '3072',
          outgoingTrafficBytes: '1024',
          totalTrafficBytes: '4096',
          activeClients: 2,
        },
      ],
      clients: [
        {
          id: 'client-ann',
          displayName: 'Ann',
          emailTag: 'ann-27b6cd0c',
          status: 'ACTIVE',
          lastSeenAt: '2026-04-02T10:10:00.000Z',
          activeConnections: 1,
          activeDays: 5,
          incomingBytes: '10240',
          outgoingBytes: '10240',
          peakActiveConnections: 2,
          todayTrafficBytes: '3072',
          totalTrafficBytes: '20480',
          windowTrafficBytes: '12288',
        },
      ],
    };

    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/dashboard/summary') {
        return summary;
      }

      if (path === '/api/dashboard/analytics?windowDays=14') {
        return analytics;
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await screen.findByText('Лидеры по трафику');
    expect(screen.getByText('Активные профили')).toBeTruthy();
    expect(screen.getByText('Состояние runtime')).toBeTruthy();
    expect(screen.getByText('Последние 14 дней')).toBeTruthy();
    expect(screen.getByText('Ann')).toBeTruthy();
    expect(screen.queryByText('Пульс трафика')).toBeNull();
    expect(screen.queryByText('Рабочие разделы')).toBeNull();
  });
});
