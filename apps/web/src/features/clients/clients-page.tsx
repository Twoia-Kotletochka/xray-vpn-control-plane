import {
  Download,
  FileUp,
  MoreHorizontal,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Search,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { Modal } from '../../components/ui/modal';
import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { StatusPill } from '../../components/ui/status-pill';
import type {
  ClientDetailResponse,
  ClientExportBundle,
  ClientImportResult,
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

type EditClientFormState = {
  deviceLimit: string;
  displayName: string;
  expiresAt: string;
  ipLimit: string;
  isTrafficUnlimited: boolean;
  note: string;
  status: ClientRecord['status'];
  tags: string;
  trafficLimitGb: string;
};

const initialCreateFormState: CreateClientFormState = {
  displayName: '',
  note: '',
  tags: '',
  durationDays: '30',
  trafficLimitGb: '100',
  isTrafficUnlimited: false,
};

const emptyEditFormState: EditClientFormState = {
  deviceLimit: '',
  displayName: '',
  expiresAt: '',
  ipLimit: '',
  isTrafficUnlimited: false,
  note: '',
  status: 'ACTIVE',
  tags: '',
  trafficLimitGb: '',
};

function toTrafficLimitBytes(value: string): number | undefined {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }

  return Math.round(numeric * 1024 * 1024 * 1024);
}

function toDateTimeLocal(value: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function mapClientToEditState(client: ClientDetailResponse): EditClientFormState {
  return {
    deviceLimit: client.deviceLimit?.toString() ?? '',
    displayName: client.displayName,
    expiresAt: toDateTimeLocal(client.expiresAt),
    ipLimit: client.ipLimit?.toString() ?? '',
    isTrafficUnlimited: client.isTrafficUnlimited,
    note: client.note ?? '',
    status: client.status,
    tags: client.tags.join(', '),
    trafficLimitGb: client.trafficLimitBytes
      ? (Number(client.trafficLimitBytes) / 1024 / 1024 / 1024).toFixed(2)
      : '',
  };
}

async function downloadText(filename: string, content: string) {
  const blob = new Blob([content], {
    type: 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ClientsPage() {
  const { apiFetch } = useAuth();
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const selectedClientIdRef = useRef<string | null>(null);
  const listRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientDetailResponse | null>(null);
  const [subscriptionBundle, setSubscriptionBundle] = useState<ClientSubscriptionBundle | null>(
    null,
  );
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [importPayload, setImportPayload] = useState('');
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [formState, setFormState] = useState<CreateClientFormState>(initialCreateFormState);
  const [editFormState, setEditFormState] = useState<EditClientFormState>(emptyEditFormState);
  const deferredSearch = useDeferredValue(search);

  const clearSelectedClient = useCallback(() => {
    detailRequestIdRef.current += 1;
    selectedClientIdRef.current = null;
    setSelectedClient(null);
    setSubscriptionBundle(null);
    setEditFormState(emptyEditFormState);
  }, []);

  const loadClientDetails = useCallback(
    async (clientId: string) => {
      const requestId = ++detailRequestIdRef.current;
      selectedClientIdRef.current = clientId;

      const [client, bundle] = await Promise.all([
        apiFetch<ClientDetailResponse>(`/api/clients/${clientId}`),
        apiFetch<ClientSubscriptionBundle>(`/api/subscriptions/client/${clientId}`),
      ]);

      if (requestId !== detailRequestIdRef.current || selectedClientIdRef.current !== clientId) {
        return;
      }

      setSelectedClient(client);
      setSubscriptionBundle(bundle);
      setEditFormState(mapClientToEditState(client));
    },
    [apiFetch],
  );

  const loadClients = useCallback(
    async (searchValue: string, preferredSelectedId?: string) => {
      const requestId = ++listRequestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiFetch<ClientListResponse>(
          `/api/clients?page=1&pageSize=50&search=${encodeURIComponent(searchValue)}`,
        );

        if (requestId !== listRequestIdRef.current) {
          return;
        }

        setClients(response.items);

        if (response.items.length === 0) {
          clearSelectedClient();
          return;
        }

        const currentSelectedId = preferredSelectedId ?? selectedClientIdRef.current;
        const nextSelectedId =
          currentSelectedId && response.items.some((item) => item.id === currentSelectedId)
            ? currentSelectedId
            : response.items[0]?.id;

        if (nextSelectedId) {
          await loadClientDetails(nextSelectedId);
        }
      } catch (loadError) {
        if (requestId !== listRequestIdRef.current) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить клиентов.');
      } finally {
        if (requestId === listRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [apiFetch, clearSelectedClient, loadClientDetails],
  );

  useEffect(() => {
    void loadClients(deferredSearch);
  }, [deferredSearch, loadClients]);

  useEffect(() => {
    let cancelled = false;

    const renderQr = async () => {
      if (!isQrOpen || !subscriptionBundle?.config.qrcodeText) {
        setQrImageUrl(null);
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(subscriptionBundle.config.qrcodeText, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 320,
        });

        if (!cancelled) {
          setQrImageUrl(dataUrl);
        }
      } catch {
        if (!cancelled) {
          setQrImageUrl(null);
        }
      }
    };

    void renderQr();

    return () => {
      cancelled = true;
    };
  }, [isQrOpen, subscriptionBundle]);

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
      await loadClients('', created.id);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : 'Не удалось создать клиента.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveClient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedClient) {
      return;
    }

    setIsSavingClient(true);

    try {
      await apiFetch(`/api/clients/${selectedClient.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          deviceLimit: Number(editFormState.deviceLimit) || undefined,
          displayName: editFormState.displayName,
          expiresAt: editFormState.expiresAt
            ? new Date(editFormState.expiresAt).toISOString()
            : null,
          ipLimit: Number(editFormState.ipLimit) || undefined,
          isTrafficUnlimited: editFormState.isTrafficUnlimited,
          note: editFormState.note || undefined,
          status: editFormState.status,
          tags: editFormState.tags
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
          trafficLimitBytes: editFormState.isTrafficUnlimited
            ? undefined
            : toTrafficLimitBytes(editFormState.trafficLimitGb),
        }),
      });

      await loadClients(search, selectedClient.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось обновить клиента.');
    } finally {
      setIsSavingClient(false);
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

    await loadClients(search, client.id);
  };

  const handleExtendClient = async (clientId: string) => {
    await apiFetch(`/api/clients/${clientId}/extend`, {
      method: 'POST',
      body: JSON.stringify({
        days: 30,
      }),
    });

    await loadClients(search, clientId);
  };

  const handleResetTraffic = async (clientId: string) => {
    await apiFetch(`/api/clients/${clientId}/reset-traffic`, {
      method: 'POST',
    });

    await loadClients(search, clientId);
  };

  const handleDeleteClient = async (clientId: string) => {
    if (!window.confirm('Удалить клиента без возможности восстановления?')) {
      return;
    }

    await apiFetch(`/api/clients/${clientId}`, {
      method: 'DELETE',
    });

    setIsQrOpen(false);
    await loadClients(search);
  };

  const copyText = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  const handleExportClients = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const payload = await apiFetch<ClientExportBundle>('/api/clients/export');
      const stamp = new Date().toISOString().slice(0, 10);

      await downloadText(`server-vpn-clients-${stamp}.json`, JSON.stringify(payload, null, 2));
      setNotice(`Экспортировано клиентов: ${payload.items.length}.`);
    } catch (exportError) {
      setError(
        exportError instanceof Error ? exportError.message : 'Не удалось выгрузить клиентов.',
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();

      setImportPayload(text);
      setIsImportOpen(true);
      setError(null);
    } catch {
      setError('Не удалось прочитать файл импорта.');
    } finally {
      event.target.value = '';
    }
  };

  const handleImportClients = async () => {
    setIsImporting(true);
    setError(null);

    try {
      const parsed = JSON.parse(importPayload) as Record<string, unknown>;
      const result = await apiFetch<ClientImportResult>('/api/clients/import', {
        method: 'POST',
        body: JSON.stringify({
          ...parsed,
          overwriteExisting,
        }),
      });

      setNotice(
        `Импорт завершён: создано ${result.created}, обновлено ${result.updated}, пропущено ${result.skipped}.`,
      );
      setIsImportOpen(false);
      setImportPayload('');
      setOverwriteExisting(false);
      await loadClients(search);
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : 'Не удалось импортировать клиентов.',
      );
    } finally {
      setIsImporting(false);
    }
  };

  const usageHistory = useMemo(() => {
    return [...(selectedClient?.usageHistory ?? [])].reverse();
  }, [selectedClient?.usageHistory]);

  const usageHistoryMax = useMemo(() => {
    return usageHistory.reduce((max, item) => Math.max(max, Number(item.totalBytes)), 0);
  }, [usageHistory]);

  return (
    <div className="page">
      <PageHeader
        title="Клиенты"
        description="Реестр клиентов с лимитами, сроками действия, управлением доступом и готовыми конфигами."
        actionLabel={isComposerOpen ? 'Скрыть форму' : 'Новый клиент'}
        onAction={() => setIsComposerOpen((value) => !value)}
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}
      {notice ? <div className="banner banner--success">{notice}</div> : null}

      <SectionCard
        title="Управление клиентами"
        subtitle="Поиск, создание, редактирование лимитов и статусов без перевыпуска клиентского UUID."
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
              className="button"
              type="button"
              onClick={() => void handleExportClients()}
              disabled={isExporting}
            >
              <Download size={16} />
              {isExporting ? 'Экспортируем...' : 'Экспорт'}
            </button>
            <button className="button" type="button" onClick={() => importFileRef.current?.click()}>
              <FileUp size={16} />
              Импорт
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
          <input
            ref={importFileRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImportFile(event)}
          />
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
                          aria-label="Показать QR и конфиг"
                          onClick={async () => {
                            await loadClientDetails(client.id);
                            setIsQrOpen(true);
                          }}
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
                  <button className="button" type="button" onClick={() => setIsQrOpen(true)}>
                    Показать QR
                  </button>
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={() => void handleDeleteClient(selectedClient.id)}
                  >
                    Удалить
                  </button>
                </div>

                <form className="inline-form" onSubmit={(event) => void handleSaveClient(event)}>
                  <div className="field-grid">
                    <label className="login-form__field">
                      <span>Имя клиента</span>
                      <input
                        value={editFormState.displayName}
                        onChange={(event) =>
                          setEditFormState((current) => ({
                            ...current,
                            displayName: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="login-form__field">
                      <span>Статус</span>
                      <select
                        value={editFormState.status}
                        onChange={(event) =>
                          setEditFormState((current) => ({
                            ...current,
                            status: event.target.value as ClientRecord['status'],
                          }))
                        }
                      >
                        <option value="ACTIVE">Активен</option>
                        <option value="DISABLED">Отключен</option>
                        <option value="BLOCKED">Заблокирован</option>
                        <option value="EXPIRED">Истек</option>
                      </select>
                    </label>
                    <label className="login-form__field">
                      <span>Дата окончания</span>
                      <input
                        type="datetime-local"
                        value={editFormState.expiresAt}
                        onChange={(event) =>
                          setEditFormState((current) => ({
                            ...current,
                            expiresAt: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="login-form__field">
                      <span>Лимит трафика, ГБ</span>
                      <input
                        type="number"
                        min="1"
                        value={editFormState.trafficLimitGb}
                        disabled={editFormState.isTrafficUnlimited}
                        onChange={(event) =>
                          setEditFormState((current) => ({
                            ...current,
                            trafficLimitGb: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="login-form__field">
                      <span>Лимит устройств</span>
                      <input
                        type="number"
                        min="1"
                        value={editFormState.deviceLimit}
                        onChange={(event) =>
                          setEditFormState((current) => ({
                            ...current,
                            deviceLimit: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="login-form__field">
                      <span>IP limit</span>
                      <input
                        type="number"
                        min="1"
                        value={editFormState.ipLimit}
                        onChange={(event) =>
                          setEditFormState((current) => ({
                            ...current,
                            ipLimit: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <label className="login-form__field">
                    <span>Теги через запятую</span>
                    <input
                      value={editFormState.tags}
                      onChange={(event) =>
                        setEditFormState((current) => ({
                          ...current,
                          tags: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="login-form__field">
                    <span>Заметка</span>
                    <input
                      value={editFormState.note}
                      onChange={(event) =>
                        setEditFormState((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={editFormState.isTrafficUnlimited}
                      onChange={(event) =>
                        setEditFormState((current) => ({
                          ...current,
                          isTrafficUnlimited: event.target.checked,
                        }))
                      }
                    />
                    <span>Безлимитный трафик</span>
                  </label>

                  <div className="toolbar__actions">
                    <button
                      className="button button--primary"
                      type="submit"
                      disabled={isSavingClient}
                    >
                      <Save size={16} />
                      {isSavingClient ? 'Сохраняем...' : 'Сохранить изменения'}
                    </button>
                  </div>
                </form>

                {subscriptionBundle ? (
                  <div className="detail-stack">
                    <div className="mono-card">
                      <div className="mono-card__header">
                        <strong>Subscription URL</strong>
                        <div className="toolbar__actions">
                          <button
                            className="button"
                            type="button"
                            onClick={() => void copyText(subscriptionBundle.config.subscriptionUrl)}
                          >
                            Скопировать
                          </button>
                          <button
                            className="button"
                            type="button"
                            onClick={() =>
                              void downloadText(
                                `${selectedClient.displayName}-subscription.txt`,
                                subscriptionBundle.config.subscriptionUrl,
                              )
                            }
                          >
                            Скачать
                          </button>
                        </div>
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

                    <div className="feature-list__card">
                      <strong>Инструкции по приложениям</strong>
                      <span>
                        Рекомендованные клиенты для Windows, macOS, Android и iPhone/iPad
                        вынесены в раздел{' '}
                        <Link to="/help">
                          <strong>Помощь</strong>
                        </Link>
                        .
                      </span>
                    </div>
                  </div>
                ) : null}

                <SectionCard title="История потребления" subtitle="Последние 30 daily buckets">
                  <div className="history-list">
                    {usageHistory.length > 0 ? (
                      usageHistory.map((bucket) => {
                        const width =
                          usageHistoryMax > 0
                            ? `${Math.max(8, (Number(bucket.totalBytes) / usageHistoryMax) * 100)}%`
                            : '8%';

                        return (
                          <div key={bucket.date} className="history-row">
                            <div className="history-row__meta">
                              <strong>{formatDateTime(bucket.date, '—')}</strong>
                              <span>{formatBytes(Number(bucket.totalBytes))}</span>
                            </div>
                            <div className="history-row__bar">
                              <span style={{ width }} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="empty-state">История трафика пока пустая.</div>
                    )}
                  </div>
                </SectionCard>
              </div>
            ) : (
              <div className="empty-state">
                Выберите клиента, чтобы увидеть подробности и конфиг.
              </div>
            )}
          </SectionCard>
        </div>
      </SectionCard>

      <Modal
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        title={selectedClient ? `Подключение: ${selectedClient.displayName}` : 'QR конфиг'}
      >
        {subscriptionBundle ? (
          <div className="detail-stack">
            <div className="qr-shell">
              {qrImageUrl ? (
                <img alt="QR конфиг клиента" src={qrImageUrl} />
              ) : (
                <div>Генерируем QR...</div>
              )}
            </div>

            <div className="toolbar__actions wrap-actions">
              <button
                className="button"
                type="button"
                onClick={() => void copyText(subscriptionBundle.config.subscriptionUrl)}
              >
                Скопировать subscription URL
              </button>
              <button
                className="button"
                type="button"
                onClick={() => void copyText(subscriptionBundle.config.uri)}
              >
                Скопировать VLESS ссылку
              </button>
            </div>

            <ul className="feature-list">
              {subscriptionBundle.instructions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="empty-state">Конфиг клиента ещё не загружен.</div>
        )}
      </Modal>

      <Modal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} title="Импорт клиентов">
        <div className="detail-stack">
          <p>
            Вставьте экспортированный JSON или загрузите файл. Флаг overwrite включайте только если
            хотите перезаписывать существующих клиентов по UUID или email tag.
          </p>

          <label className="login-form__field">
            <span>JSON payload</span>
            <textarea
              className="textarea-field"
              rows={14}
              value={importPayload}
              onChange={(event) => setImportPayload(event.target.value)}
              placeholder='{"schemaVersion":1,"items":[...]}'
            />
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={overwriteExisting}
              onChange={(event) => setOverwriteExisting(event.target.checked)}
            />
            <span>Перезаписывать существующих клиентов при совпадении</span>
          </label>

          <div className="toolbar__actions wrap-actions">
            <button
              className="button button--primary"
              type="button"
              onClick={() => void handleImportClients()}
              disabled={isImporting || importPayload.trim().length === 0}
            >
              {isImporting ? 'Импортируем...' : 'Запустить импорт'}
            </button>
            <button className="button" type="button" onClick={() => setIsImportOpen(false)}>
              Отмена
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
