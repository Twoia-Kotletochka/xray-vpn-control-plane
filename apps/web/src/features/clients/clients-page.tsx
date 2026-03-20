import { MoreHorizontal, Plus, QrCode, RotateCcw, Search } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { StatusPill } from '../../components/ui/status-pill';
import type {
  ClientDetailResponse,
  ClientListResponse,
  ClientRecord,
  ClientSubscriptionBundle,
} from '../../lib/api-types';
import { formatBytes, formatClientStatus, formatDateTime, statusTone } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

type CreateClientFormState = {
  displayName: string;
  note: string;
  tags: string;
  durationDays: string;
  trafficLimitGb: string;
  isTrafficUnlimited: boolean;
};

const initialCreateFormState: CreateClientFormState = {
  displayName: '',
  note: '',
  tags: '',
  durationDays: '30',
  trafficLimitGb: '100',
  isTrafficUnlimited: false,
};

function toTrafficLimitBytes(value: string): number | undefined {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }

  return Math.round(numeric * 1024 * 1024 * 1024);
}

export function ClientsPage() {
  const { apiFetch } = useAuth();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientDetailResponse | null>(null);
  const [subscriptionBundle, setSubscriptionBundle] = useState<ClientSubscriptionBundle | null>(
    null,
  );
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<CreateClientFormState>(initialCreateFormState);
  const deferredSearch = useDeferredValue(search);

  const loadClientDetails = useCallback(
    async (clientId: string) => {
      const [client, bundle] = await Promise.all([
        apiFetch<ClientDetailResponse>(`/api/clients/${clientId}`),
        apiFetch<ClientSubscriptionBundle>(`/api/subscriptions/client/${clientId}`),
      ]);

      setSelectedClient(client);
      setSubscriptionBundle(bundle);
    },
    [apiFetch],
  );

  const loadClients = useCallback(
    async (searchValue: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiFetch<ClientListResponse>(
          `/api/clients?page=1&pageSize=50&search=${encodeURIComponent(searchValue)}`,
        );

        setClients(response.items);

        if (response.items.length === 0) {
          setSelectedClient(null);
          setSubscriptionBundle(null);
          return;
        }

        const nextSelectedId =
          selectedClient && response.items.some((item) => item.id === selectedClient.id)
            ? selectedClient.id
            : response.items[0]?.id;

        if (nextSelectedId) {
          await loadClientDetails(nextSelectedId);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить клиентов.');
      } finally {
        setIsLoading(false);
      }
    },
    [apiFetch, loadClientDetails, selectedClient],
  );

  useEffect(() => {
    void loadClients(deferredSearch);
  }, [deferredSearch, loadClients]);

  const handleCreateClient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const created = await apiFetch<ClientRecord>('/api/clients', {
        method: 'POST',
        body: JSON.stringify({
          displayName: formState.displayName,
          note: formState.note || undefined,
          tags: formState.tags
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
          durationDays: Number(formState.durationDays) || undefined,
          isTrafficUnlimited: formState.isTrafficUnlimited,
          trafficLimitBytes: formState.isTrafficUnlimited
            ? undefined
            : toTrafficLimitBytes(formState.trafficLimitGb),
        }),
      });

      setFormState(initialCreateFormState);
      setIsComposerOpen(false);
      await loadClients('');
      await loadClientDetails(created.id);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : 'Не удалось создать клиента.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleClient = async (client: ClientRecord) => {
    const nextStatus = client.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED';

    await apiFetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: nextStatus,
      }),
    });

    await loadClients(search);
  };

  const handleExtendClient = async (clientId: string) => {
    await apiFetch(`/api/clients/${clientId}/extend`, {
      method: 'POST',
      body: JSON.stringify({
        days: 30,
      }),
    });

    await loadClients(search);
  };

  const handleResetTraffic = async (clientId: string) => {
    await apiFetch(`/api/clients/${clientId}/reset-traffic`, {
      method: 'POST',
    });

    await loadClients(search);
  };

  const handleDeleteClient = async (clientId: string) => {
    if (!window.confirm('Удалить клиента без возможности восстановления?')) {
      return;
    }

    await apiFetch(`/api/clients/${clientId}`, {
      method: 'DELETE',
    });

    await loadClients(search);
  };

  const copyText = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  return (
    <div className="page">
      <PageHeader
        title="Клиенты"
        description="Реальный реестр клиентов с лимитами, сроками действия, действиями управления и готовыми подписками."
        actionLabel={isComposerOpen ? 'Скрыть форму' : 'Новый клиент'}
        onAction={() => setIsComposerOpen((value) => !value)}
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <SectionCard
        title="Управление клиентами"
        subtitle="Поиск, создание и быстрые действия без пересоздания конфигов."
      >
        <div className="toolbar">
          <label className="toolbar__search">
            <Search size={16} />
            <input
              placeholder="Поиск по имени, UUID, тегу или заметке"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <div className="toolbar__actions">
            <button className="button" type="button" onClick={() => setSearch('')}>
              <RotateCcw size={16} />
              Сбросить
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={() => setIsComposerOpen((value) => !value)}
            >
              <Plus size={16} />
              {isComposerOpen ? 'Закрыть форму' : 'Добавить клиента'}
            </button>
          </div>
        </div>

        {isComposerOpen ? (
          <form className="inline-form" onSubmit={(event) => void handleCreateClient(event)}>
            <div className="field-grid">
              <label className="login-form__field">
                <span>Имя клиента</span>
                <input
                  value={formState.displayName}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, displayName: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="login-form__field">
                <span>Срок, дней</span>
                <input
                  type="number"
                  min="1"
                  value={formState.durationDays}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, durationDays: event.target.value }))
                  }
                />
              </label>
              <label className="login-form__field">
                <span>Лимит трафика, ГБ</span>
                <input
                  type="number"
                  min="1"
                  value={formState.trafficLimitGb}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, trafficLimitGb: event.target.value }))
                  }
                  disabled={formState.isTrafficUnlimited}
                />
              </label>
              <label className="login-form__field">
                <span>Теги через запятую</span>
                <input
                  value={formState.tags}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, tags: event.target.value }))
                  }
                />
              </label>
            </div>

            <label className="login-form__field">
              <span>Заметка</span>
              <input
                value={formState.note}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, note: event.target.value }))
                }
              />
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={formState.isTrafficUnlimited}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    isTrafficUnlimited: event.target.checked,
                  }))
                }
              />
              <span>Безлимитный трафик</span>
            </label>

            <div className="toolbar__actions">
              <button className="button button--primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Создаём клиента...' : 'Создать клиента'}
              </button>
            </div>
          </form>
        ) : null}

        <div className="split-grid">
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>Статус</th>
                  <th>Трафик</th>
                  <th>Срок</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} className="table-row--interactive">
                    <td>
                      <button
                        className="table-link"
                        type="button"
                        onClick={() => void loadClientDetails(client.id)}
                      >
                        <div className="table-main">
                          <strong>{client.displayName}</strong>
                          <span>{client.emailTag}</span>
                        </div>
                      </button>
                    </td>
                    <td>
                      <StatusPill tone={statusTone(client.status)}>
                        {formatClientStatus(client.status)}
                      </StatusPill>
                    </td>
                    <td>{formatBytes(Number(client.trafficUsedBytes))}</td>
                    <td>{formatDateTime(client.expiresAt, 'Без срока')}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label="Показать конфиг"
                          onClick={() => void loadClientDetails(client.id)}
                        >
                          <QrCode size={16} />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          aria-label="Отключить или включить клиента"
                          onClick={() => void handleToggleClient(client)}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && clients.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">По текущему фильтру клиентов пока нет.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <SectionCard
            title={selectedClient ? selectedClient.displayName : 'Карточка клиента'}
            subtitle={
              selectedClient
                ? `${formatClientStatus(selectedClient.status)} • ${selectedClient.uuid}`
                : 'Выберите клиента из таблицы, чтобы увидеть детали и конфиг.'
            }
          >
            {selectedClient ? (
              <div className="detail-stack">
                <div className="stat-grid">
                  <div className="stat-card">
                    <span>Использовано</span>
                    <strong>{formatBytes(Number(selectedClient.trafficUsedBytes))}</strong>
                  </div>
                  <div className="stat-card">
                    <span>Остаток</span>
                    <strong>
                      {selectedClient.remainingTrafficBytes
                        ? formatBytes(Number(selectedClient.remainingTrafficBytes))
                        : 'Без лимита'}
                    </strong>
                  </div>
                  <div className="stat-card">
                    <span>Подключения</span>
                    <strong>{selectedClient.activeConnections}</strong>
                  </div>
                </div>

                <div className="toolbar__actions wrap-actions">
                  <button
                    className="button"
                    type="button"
                    onClick={() => void handleExtendClient(selectedClient.id)}
                  >
                    Продлить на 30 дней
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() => void handleResetTraffic(selectedClient.id)}
                  >
                    Сбросить трафик
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() => void handleToggleClient(selectedClient)}
                  >
                    {selectedClient.status === 'DISABLED' ? 'Включить' : 'Отключить'}
                  </button>
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={() => void handleDeleteClient(selectedClient.id)}
                  >
                    Удалить
                  </button>
                </div>

                {subscriptionBundle ? (
                  <div className="detail-stack">
                    <div className="mono-card">
                      <div className="mono-card__header">
                        <strong>Subscription URL</strong>
                        <button
                          className="button"
                          type="button"
                          onClick={() => void copyText(subscriptionBundle.config.subscriptionUrl)}
                        >
                          Скопировать
                        </button>
                      </div>
                      <code>{subscriptionBundle.config.subscriptionUrl}</code>
                    </div>

                    <div className="mono-card">
                      <div className="mono-card__header">
                        <strong>VLESS ссылка</strong>
                        <button
                          className="button"
                          type="button"
                          onClick={() => void copyText(subscriptionBundle.config.uri)}
                        >
                          Скопировать
                        </button>
                      </div>
                      <code>{subscriptionBundle.config.uri}</code>
                    </div>

                    <ul className="feature-list">
                      {subscriptionBundle.instructions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty-state">
                Выберите клиента, чтобы увидеть подробности и конфиг.
              </div>
            )}
          </SectionCard>
        </div>
      </SectionCard>
    </div>
  );
}
