// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardAnalyticsResponse } from '../../lib/api-types';
import { AnalyticsPage } from './analytics-page';

const mockApiFetch = vi.fn();

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    apiFetch: mockApiFetch,
  }),
}));

describe('AnalyticsPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('renders traffic analytics with chart, leaders, and client table', async () => {
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
        topClientTrafficBytes: '20480',
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
        {
          id: 'client-den',
          displayName: 'Den',
          emailTag: 'den-bc966509',
          status: 'ACTIVE',
          lastSeenAt: null,
          activeConnections: 0,
          activeDays: 2,
          incomingBytes: '4096',
          outgoingBytes: '8192',
          peakActiveConnections: 1,
          todayTrafficBytes: '1024',
          totalTrafficBytes: '12288',
          windowTrafficBytes: '4096',
        },
      ],
    };

    mockApiFetch.mockResolvedValue(analytics);

    render(<AnalyticsPage />);

    await screen.findByRole('img');
    expect(screen.getAllByText('Ann').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ann-27b6cd0c').length).toBeGreaterThan(0);
    expect((await screen.findAllByRole('button', { name: /14/i })).length).toBeGreaterThan(0);
    expect((await screen.findAllByRole('button', { name: /30/i })).length).toBeGreaterThan(0);
  });

  it('reloads analytics when the window preset changes', async () => {
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
        topClientTrafficBytes: '8192',
        todayTrafficBytes: '4096',
      },
      timeline: [],
      clients: [],
    };

    mockApiFetch.mockResolvedValue(analytics);

    render(<AnalyticsPage />);

    await screen.findAllByRole('button', { name: /14/i });
    const button30 = (await screen.findAllByRole('button', { name: /30/i }))[0]!;
    fireEvent.click(button30);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenLastCalledWith('/api/dashboard/analytics?windowDays=30');
    });
  });
});
