// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ClientDetailResponse,
  ClientListResponse,
  ClientRecord,
  ClientSubscriptionBundle,
} from '../../lib/api-types';
import { ClientsPage } from './clients-page';

const mockApiFetch = vi.fn();

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    apiFetch: mockApiFetch,
  }),
}));

function createClient(id: string, displayName: string, emailTag: string, uuid: string): ClientRecord {
  return {
    id,
    uuid,
    emailTag,
    displayName,
    note: null,
    tags: [],
    status: 'ACTIVE',
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
    startsAt: '2026-03-24T00:00:00.000Z',
    expiresAt: '2026-04-23T00:00:00.000Z',
    durationDays: 30,
    trafficLimitBytes: '1073741824',
    isTrafficUnlimited: false,
    trafficUsedBytes: '0',
    incomingBytes: '0',
    outgoingBytes: '0',
    remainingTrafficBytes: '1073741824',
    deviceLimit: null,
    ipLimit: null,
    subscriptionToken: `token-${id}`,
    transportProfile: 'VLESS_REALITY_TCP',
    xrayInboundTag: 'vless-reality-main',
    activeConnections: 0,
    lastActivatedAt: null,
    lastSeenAt: null,
  };
}

function createClientDetail(client: ClientRecord): ClientDetailResponse {
  return {
    ...client,
    usageHistory: [],
  };
}

function createBundle(client: ClientRecord): ClientSubscriptionBundle {
  return {
    client,
    config: {
      uri: `vless://${client.uuid}@example.com:443#${client.displayName}`,
      qrcodeText: `vless://${client.uuid}@example.com:443#${client.displayName}`,
      subscriptionUrl: `https://example.com/api/subscriptions/${client.subscriptionToken}`,
    },
    instructions: [],
    platformGuides: [],
  };
}

function selectedClientStatusText(client: ClientRecord) {
  return `Не активен • ${client.uuid}`;
}

describe('ClientsPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(),
      },
    });
  });

  it('keeps the selected client stable without reloading the list', async () => {
    const firstClient = createClient(
      'client-1',
      'Client One',
      'client-one',
      '11111111-1111-1111-1111-111111111111',
    );
    const secondClient = createClient(
      'client-2',
      'Client Two',
      'client-two',
      '22222222-2222-2222-2222-222222222222',
    );
    const listResponse: ClientListResponse = {
      items: [firstClient, secondClient],
      pagination: {
        page: 1,
        pageSize: 50,
        total: 2,
      },
      filters: {
        search: null,
      },
    };
    const detailsByPath: Record<string, ClientDetailResponse> = {
      '/api/clients/client-1': createClientDetail(firstClient),
      '/api/clients/client-2': createClientDetail(secondClient),
    };
    const bundlesByPath: Record<string, ClientSubscriptionBundle> = {
      '/api/subscriptions/client/client-1': createBundle(firstClient),
      '/api/subscriptions/client/client-2': createBundle(secondClient),
    };

    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/clients?page=1&pageSize=50&search=') {
        return listResponse;
      }

      if (path in detailsByPath) {
        return detailsByPath[path];
      }

      if (path in bundlesByPath) {
        return bundlesByPath[path];
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter>
        <ClientsPage />
      </MemoryRouter>,
    );

    await screen.findByText(selectedClientStatusText(firstClient));
    expect(screen.getByRole('button', { name: /Client One/i }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: /Client Two/i }).getAttribute('aria-pressed')).toBe(
      'false',
    );

    const listCalls = () =>
      mockApiFetch.mock.calls.filter(([path]) =>
        String(path).startsWith('/api/clients?page=1&pageSize=50&search='),
      ).length;

    expect(listCalls()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /Client Two/i }));

    await screen.findByText(selectedClientStatusText(secondClient));
    expect(screen.getByRole('button', { name: /Client One/i }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: /Client Two/i }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    await waitFor(() => {
      expect(listCalls()).toBe(1);
    });
  });

  it('shows an explicit block action instead of the three-dots button', async () => {
    const client = createClient(
      'client-1',
      'Client One',
      'client-one',
      '11111111-1111-1111-1111-111111111111',
    );
    const listResponse: ClientListResponse = {
      items: [client],
      pagination: {
        page: 1,
        pageSize: 50,
        total: 1,
      },
      filters: {
        search: null,
      },
    };

    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/clients?page=1&pageSize=50&search=') {
        return listResponse;
      }

      if (path === '/api/clients/client-1') {
        return createClientDetail(client);
      }

      if (path === '/api/subscriptions/client/client-1') {
        return createBundle(client);
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter>
        <ClientsPage />
      </MemoryRouter>,
    );

    expect(await screen.findAllByRole('button', { name: /Заблокировать/i })).not.toHaveLength(0);
  });

  it('sends device and IP limits when creating a client', async () => {
    let createdClient: ClientRecord | null = null;
    const createdUuid = '33333333-3333-3333-3333-333333333333';
    const fallbackClient = createClient(
      'fallback',
      'Fallback',
      'fallback',
      '44444444-4444-4444-4444-444444444444',
    );

    mockApiFetch.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === '/api/clients?page=1&pageSize=50&search=') {
        return {
          items: createdClient ? [createdClient] : [],
          pagination: {
            page: 1,
            pageSize: 50,
            total: createdClient ? 1 : 0,
          },
          filters: {
            search: null,
          },
        } satisfies ClientListResponse;
      }

      if (path === '/api/clients' && options?.method === 'POST') {
        expect(JSON.parse(String(options.body))).toMatchObject({
          displayName: 'Shared plan',
          deviceLimit: 3,
          ipLimit: 2,
        });

        createdClient = createClient(
          'client-3',
          'Shared plan',
          'shared-plan',
          createdUuid,
        );

        return createdClient;
      }

      if (path === '/api/clients/client-3') {
        return createClientDetail(createdClient ?? fallbackClient);
      }

      if (path === '/api/subscriptions/client/client-3') {
        return createBundle(createdClient ?? fallbackClient);
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter>
        <ClientsPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Добавить клиента/i }));

    fireEvent.change(screen.getByLabelText('Имя клиента'), { target: { value: 'Shared plan' } });
    fireEvent.change(screen.getByLabelText('Лимит устройств'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Лимит IP'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Создать клиента/i }));

    await screen.findByText(`Не активен • ${createdUuid}`);
  });

  it('clears device and IP limits back to unlimited', async () => {
    const client = {
      ...createClient(
        'client-4',
        'Limited Client',
        'limited-client',
        '44444444-4444-4444-4444-444444444444',
      ),
      deviceLimit: 3,
      ipLimit: 2,
    } satisfies ClientRecord;

    mockApiFetch.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === '/api/clients?page=1&pageSize=50&search=') {
        return {
          items: [client],
          pagination: {
            page: 1,
            pageSize: 50,
            total: 1,
          },
          filters: {
            search: null,
          },
        } satisfies ClientListResponse;
      }

      if (path === '/api/clients/client-4' && options?.method === 'PATCH') {
        expect(JSON.parse(String(options.body))).toMatchObject({
          deviceLimit: null,
          ipLimit: null,
        });

        return {
          ...client,
          deviceLimit: null,
          ipLimit: null,
        };
      }

      if (path === '/api/clients/client-4') {
        return createClientDetail(client);
      }

      if (path === '/api/subscriptions/client/client-4') {
        return createBundle(client);
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter>
        <ClientsPage />
      </MemoryRouter>,
    );

    await screen.findByText(selectedClientStatusText(client));

    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '' } });
    fireEvent.change(screen.getByDisplayValue('2'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить изменения/i }));

    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.some(
          ([path, options]) =>
            path === '/api/clients/client-4' && (options as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toBe(true);
    });
  });
});
