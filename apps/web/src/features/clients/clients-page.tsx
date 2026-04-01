import {
  Download,
  FileUp,
  Lock,
  LockOpen,
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
import { useI18n } from '../../i18n';
import type {
  ClientDetailResponse,
  ClientExportBundle,
  ClientImportResult,
  ClientListResponse,
  ClientRecord,
  ClientSubscriptionBundle,
} from '../../lib/api-types';
import {
  formatBytes,
  formatClientAccessStatus,
  formatClientLiveStatus,
  formatDateTime,
  liveStatusTone,
  resolveClientLiveStatus,
} from '../../lib/format';
import { useAuth } from '../auth/auth-context';

type CreateClientFormState = {
  deviceLimit: string;
  displayName: string;
  ipLimit: string;
  note: string;
  tags: string;
  durationDays: string;
  trafficLimitGb: string;
  isTrafficUnlimited: boolean;
};

type EditClientFormState = {
  accessStatus: 'ACTIVE' | 'DISABLED';
  deviceLimit: string;
  displayName: string;
  expiresAt: string;
  ipLimit: string;
  isTrafficUnlimited: boolean;
  note: string;
  tags: string;
  trafficLimitGb: string;
};

const initialCreateFormState: CreateClientFormState = {
  deviceLimit: '',
  displayName: '',
  ipLimit: '',
  note: '',
  tags: '',
  durationDays: '30',
  trafficLimitGb: '100',
  isTrafficUnlimited: false,
};

const emptyEditFormState: EditClientFormState = {
  accessStatus: 'ACTIVE',
  deviceLimit: '',
  displayName: '',
  expiresAt: '',
  ipLimit: '',
  isTrafficUnlimited: false,
  note: '',
  tags: '',
  trafficLimitGb: '',
};

function isClientManuallyBlocked(status: ClientRecord['status']) {
  return status === 'DISABLED';
}

function toTrafficLimitBytes(value: string): number | undefined {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }

  return Math.round(numeric * 1024 * 1024 * 1024);
}

function toOptionalLimit(value: string): number | null {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.trunc(numeric);
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
    accessStatus: isClientManuallyBlocked(client.status) ? 'DISABLED' : 'ACTIVE',
    deviceLimit: client.deviceLimit?.toString() ?? '',
    displayName: client.displayName,
    expiresAt: toDateTimeLocal(client.expiresAt),
    ipLimit: client.ipLimit?.toString() ?? '',
    isTrafficUnlimited: client.isTrafficUnlimited,
    note: client.note ?? '',
    tags: client.tags.join(', '),
    trafficLimitGb: client.trafficLimitBytes
      ? (Number(client.trafficLimitBytes) / 1024 / 1024 / 1024).toFixed(2)
      : '',
  };
}

function resolveRequestedStatus(
  currentStatus: ClientRecord['status'],
  accessStatus: EditClientFormState['accessStatus'],
): ClientRecord['status'] {
  if (accessStatus === 'DISABLED') {
    return 'DISABLED';
  }

  return currentStatus === 'DISABLED' ? 'ACTIVE' : currentStatus;
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

function translateSubscriptionInstruction(instruction: string, locale: 'ru' | 'en') {
  if (locale === 'ru') {
    return instruction;
  }

  const translations: Record<string, string> = {
    'Импортируйте subscription URL в совместимый VLESS/Xray клиент.':
      'Import the subscription URL into a compatible VLESS/Xray client.',
    'Если клиент не поддерживает подписки, используйте VLESS-ссылку напрямую или QR-код.':
      'If the client does not support subscriptions, use the VLESS link directly or the QR code.',
    'После продления и изменения лимитов ссылка обычно остаётся прежней, достаточно обновить подписку.':
      'After extending access or changing limits, the link usually stays the same and only the subscription refresh is needed.',
  };

  return translations[instruction] ?? instruction;
}

export function ClientsPage() {
  const { admin, apiFetch } = useAuth();
  const { locale, ui } = useI18n();
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
  const isEnglish = locale === 'en';
  const isReadOnly = admin?.role === 'READ_ONLY';
  const text = {
    loadError: isEnglish ? 'Failed to load clients.' : 'Не удалось загрузить клиентов.',
    createError: isEnglish ? 'Failed to create the client.' : 'Не удалось создать клиента.',
    updateError: isEnglish ? 'Failed to update the client.' : 'Не удалось обновить клиента.',
    deleteConfirm: isEnglish
      ? 'Delete the client without recovery?'
      : 'Удалить клиента без возможности восстановления?',
    exportNotice: (count: number) =>
      isEnglish ? `Exported clients: ${count}.` : `Экспортировано клиентов: ${count}.`,
    exportError: isEnglish ? 'Failed to export clients.' : 'Не удалось выгрузить клиентов.',
    importReadError: isEnglish
      ? 'Failed to read the import file.'
      : 'Не удалось прочитать файл импорта.',
    importDone: (created: number, updated: number, skipped: number) =>
      isEnglish
        ? `Import completed: created ${created}, updated ${updated}, skipped ${skipped}.`
        : `Импорт завершён: создано ${created}, обновлено ${updated}, пропущено ${skipped}.`,
    importError: isEnglish
      ? 'Failed to import clients.'
      : 'Не удалось импортировать клиентов.',
    description: isEnglish
      ? 'Client registry with quotas, expirations, access management, and ready-to-use configs.'
      : 'Реестр клиентов с лимитами, сроками действия, управлением доступом и готовыми конфигами.',
    hideForm: isEnglish ? 'Hide form' : 'Скрыть форму',
    newClient: isEnglish ? 'New client' : 'Новый клиент',
    managementTitle: isEnglish ? 'Client management' : 'Управление клиентами',
    managementSubtitle: isEnglish
      ? 'Search, create, and edit quotas or access without reissuing the client UUID.'
      : 'Поиск, создание, редактирование лимитов и доступа без перевыпуска клиентского UUID.',
    searchPlaceholder: isEnglish
      ? 'Search by name, UUID, tag, or note'
      : 'Поиск по имени, UUID, тегу или заметке',
    reset: isEnglish ? 'Reset' : 'Сбросить',
    exporting: isEnglish ? 'Exporting...' : 'Экспортируем...',
    export: isEnglish ? 'Export' : 'Экспорт',
    import: isEnglish ? 'Import' : 'Импорт',
    closeForm: isEnglish ? 'Close form' : 'Закрыть форму',
    addClient: isEnglish ? 'Add client' : 'Добавить клиента',
    clientName: isEnglish ? 'Client name' : 'Имя клиента',
    durationDays: isEnglish ? 'Duration, days' : 'Срок, дней',
    trafficLimitGb: isEnglish ? 'Traffic limit, GB' : 'Лимит трафика, ГБ',
    tagsComma: isEnglish ? 'Comma-separated tags' : 'Теги через запятую',
    note: isEnglish ? 'Note' : 'Заметка',
    unlimitedTraffic: isEnglish ? 'Unlimited traffic' : 'Безлимитный трафик',
    creatingClient: isEnglish ? 'Creating client...' : 'Создаём клиента...',
    createClient: isEnglish ? 'Create client' : 'Создать клиента',
    client: isEnglish ? 'Client' : 'Клиент',
    status: isEnglish ? 'Status' : 'Статус',
    access: isEnglish ? 'Access' : 'Доступ',
    traffic: isEnglish ? 'Traffic' : 'Трафик',
    expiry: isEnglish ? 'Expiry' : 'Срок',
    actions: isEnglish ? 'Actions' : 'Действия',
    noClients: isEnglish ? 'No clients match the current filter yet.' : 'По текущему фильтру клиентов пока нет.',
    clientCard: isEnglish ? 'Client card' : 'Карточка клиента',
    selectClient: isEnglish
      ? 'Choose a client from the table to view details and config.'
      : 'Выберите клиента из таблицы, чтобы увидеть детали и конфиг.',
    used: isEnglish ? 'Used' : 'Использовано',
    remaining: isEnglish ? 'Remaining' : 'Остаток',
    noLimit: isEnglish ? 'No limit' : 'Без лимита',
    connections: isEnglish ? 'Connections' : 'Подключения',
    extend30: isEnglish ? 'Extend by 30 days' : 'Продлить на 30 дней',
    resetTraffic: isEnglish ? 'Reset traffic' : 'Сбросить трафик',
    unblock: isEnglish ? 'Unblock' : 'Разблокировать',
    block: isEnglish ? 'Block' : 'Заблокировать',
    showQr: isEnglish ? 'Show QR' : 'Показать QR',
    delete: isEnglish ? 'Delete' : 'Удалить',
    expiryDate: isEnglish ? 'Expiry date' : 'Дата окончания',
    deviceLimit: isEnglish ? 'Device limit' : 'Лимит устройств',
    ipLimit: isEnglish ? 'IP limit' : 'Лимит IP',
    limitHint: isEnglish ? 'Leave empty for unlimited access.' : 'Оставьте пустым для режима без ограничений.',
    ipLimitHint: isEnglish
      ? 'Counts simultaneous external IPs for one config.'
      : 'Считает одновременные внешние IP для одного конфига.',
    saving: isEnglish ? 'Saving...' : 'Сохраняем...',
    saveChanges: isEnglish ? 'Save changes' : 'Сохранить изменения',
    copy: isEnglish ? 'Copy' : 'Скопировать',
    download: isEnglish ? 'Download' : 'Скачать',
    vlessLink: isEnglish ? 'VLESS link' : 'VLESS ссылка',
    appGuides: isEnglish ? 'Client app guides' : 'Инструкции по приложениям',
    appGuidesText: isEnglish
      ? 'Recommended clients for Windows, macOS, Android, and iPhone/iPad are available in the'
      : 'Рекомендованные клиенты для Windows, macOS, Android и iPhone/iPad вынесены в раздел',
    help: isEnglish ? 'Help' : 'Помощь',
    usageHistory: isEnglish ? 'Usage history' : 'История потребления',
    usageHistorySubtitle: isEnglish ? 'Last 30 daily buckets' : 'Последние 30 daily buckets',
    historyEmpty: isEnglish ? 'Traffic history is empty so far.' : 'История трафика пока пустая.',
    selectClientEmpty: isEnglish
      ? 'Select a client to see details and config.'
      : 'Выберите клиента, чтобы увидеть подробности и конфиг.',
    connectionTitle: (name: string) => (isEnglish ? `Connection: ${name}` : `Подключение: ${name}`),
    qrConfig: isEnglish ? 'QR config' : 'QR конфиг',
    qrAlt: isEnglish ? 'Client QR config' : 'QR конфиг клиента',
    generatingQr: isEnglish ? 'Generating QR...' : 'Генерируем QR...',
    copySubscriptionUrl: isEnglish ? 'Copy subscription URL' : 'Скопировать subscription URL',
    copyVlessLink: isEnglish ? 'Copy VLESS link' : 'Скопировать VLESS ссылку',
    clientConfigNotLoaded: isEnglish
      ? 'Client config has not been loaded yet.'
      : 'Конфиг клиента ещё не загружен.',
    importClients: isEnglish ? 'Import clients' : 'Импорт клиентов',
    importHint: isEnglish
      ? 'Paste exported JSON or upload a file. Enable overwrite only if you want to replace existing clients by UUID or email tag.'
      : 'Вставьте экспортированный JSON или загрузите файл. Флаг overwrite включайте только если хотите перезаписывать существующих клиентов по UUID или email tag.',
    overwriteExisting: isEnglish
      ? 'Overwrite existing matching clients'
      : 'Перезаписывать существующих клиентов при совпадении',
    importing: isEnglish ? 'Importing...' : 'Импортируем...',
    runImport: isEnglish ? 'Run import' : 'Запустить импорт',
    cancel: isEnglish ? 'Cancel' : 'Отмена',
    noExpiry: isEnglish ? 'No expiry' : 'Без срока',
    notAvailable: isEnglish ? '—' : '—',
    qrConfigAria: isEnglish ? 'Show QR and config' : 'Показать QR и конфиг',
    blockClientAria: isEnglish ? 'Block client access' : 'Заблокировать доступ клиента',
    unblockClientAria: isEnglish ? 'Restore client access' : 'Разблокировать доступ клиента',
  };

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

        setError(loadError instanceof Error ? loadError.message : text.loadError);
      } finally {
        if (requestId === listRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [apiFetch, clearSelectedClient, loadClientDetails, text.loadError],
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
          deviceLimit: toOptionalLimit(formState.deviceLimit) ?? undefined,
          isTrafficUnlimited: formState.isTrafficUnlimited,
          ipLimit: toOptionalLimit(formState.ipLimit) ?? undefined,
          trafficLimitBytes: formState.isTrafficUnlimited
            ? undefined
            : toTrafficLimitBytes(formState.trafficLimitGb),
        }),
      });

      setFormState(initialCreateFormState);
      setIsComposerOpen(false);
      await loadClients('', created.id);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : text.createError);
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
          deviceLimit: toOptionalLimit(editFormState.deviceLimit),
          displayName: editFormState.displayName,
          expiresAt: editFormState.expiresAt
            ? new Date(editFormState.expiresAt).toISOString()
            : null,
          ipLimit: toOptionalLimit(editFormState.ipLimit),
          isTrafficUnlimited: editFormState.isTrafficUnlimited,
          note: editFormState.note || undefined,
          status: resolveRequestedStatus(selectedClient.status, editFormState.accessStatus),
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
      setError(saveError instanceof Error ? saveError.message : text.updateError);
    } finally {
      setIsSavingClient(false);
    }
  };

  const handleToggleClient = async (client: ClientRecord) => {
    const nextStatus = isClientManuallyBlocked(client.status) ? 'ACTIVE' : 'DISABLED';

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
    if (!window.confirm(text.deleteConfirm)) {
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
      setNotice(text.exportNotice(payload.items.length));
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : text.exportError);
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
      setError(text.importReadError);
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

      setNotice(text.importDone(result.created, result.updated, result.skipped));
      setIsImportOpen(false);
      setImportPayload('');
      setOverwriteExisting(false);
      await loadClients(search);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : text.importError);
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

  const headerActionLabel = isReadOnly ? '' : isComposerOpen ? text.hideForm : text.newClient;

  return (
    <div className="page">
      <PageHeader
        title={ui.clients.title}
        description={text.description}
        actionLabel={headerActionLabel}
        onAction={() =>
          !isReadOnly ? setIsComposerOpen((value) => !value) : undefined
        }
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}
      {notice ? <div className="banner banner--success">{notice}</div> : null}

      <SectionCard
        title={text.managementTitle}
        subtitle={text.managementSubtitle}
      >
        <div className="toolbar">
          <label className="toolbar__search">
            <Search size={16} />
            <input
              placeholder={text.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <div className="toolbar__actions">
            <button className="button" type="button" onClick={() => setSearch('')}>
              <RotateCcw size={16} />
              {text.reset}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => void handleExportClients()}
              disabled={isExporting}
            >
              <Download size={16} />
              {isExporting ? text.exporting : text.export}
            </button>
            {!isReadOnly ? (
              <>
                <button className="button" type="button" onClick={() => importFileRef.current?.click()}>
                  <FileUp size={16} />
                  {text.import}
                </button>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => setIsComposerOpen((value) => !value)}
                >
                  <Plus size={16} />
                  {isComposerOpen ? text.closeForm : text.addClient}
                </button>
              </>
            ) : null}
          </div>
          <input
            ref={importFileRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImportFile(event)}
          />
        </div>

        {!isReadOnly && isComposerOpen ? (
          <form className="inline-form" onSubmit={(event) => void handleCreateClient(event)}>
            <div className="field-grid">
              <label className="login-form__field">
                <span>{text.clientName}</span>
                <input
                  value={formState.displayName}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, displayName: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="login-form__field">
                <span>{text.durationDays}</span>
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
                <span>{text.trafficLimitGb}</span>
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
                <span>{text.deviceLimit}</span>
                <input
                  type="number"
                  min="1"
                  placeholder={text.noLimit}
                  value={formState.deviceLimit}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, deviceLimit: event.target.value }))
                  }
                />
                <small className="form-hint">{text.limitHint}</small>
              </label>
              <label className="login-form__field">
                <span>{text.ipLimit}</span>
                <input
                  type="number"
                  min="1"
                  placeholder={text.noLimit}
                  value={formState.ipLimit}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, ipLimit: event.target.value }))
                  }
                />
                <small className="form-hint">
                  {text.limitHint} {text.ipLimitHint}
                </small>
              </label>
              <label className="login-form__field">
                <span>{text.tagsComma}</span>
                <input
                  value={formState.tags}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, tags: event.target.value }))
                  }
                />
              </label>
            </div>

            <label className="login-form__field">
              <span>{text.note}</span>
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
              <span>{text.unlimitedTraffic}</span>
            </label>

            <div className="toolbar__actions">
              <button className="button button--primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? text.creatingClient : text.createClient}
              </button>
            </div>
          </form>
        ) : null}

        <div className="split-grid split-grid--clients">
          <div className="table-shell table-shell--clients">
            <table className="data-table clients-table">
              <colgroup>
                <col className="clients-table__col clients-table__col--client" />
                <col className="clients-table__col clients-table__col--status" />
                <col className="clients-table__col clients-table__col--traffic" />
                <col className="clients-table__col clients-table__col--expiry" />
                <col className="clients-table__col clients-table__col--actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>{text.client}</th>
                  <th>{text.status}</th>
                  <th>{text.traffic}</th>
                  <th>{text.expiry}</th>
                  <th>{text.actions}</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} className="table-row--interactive">
                    <td className="clients-table__cell clients-table__cell--client">
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
                    <td className="clients-table__cell clients-table__cell--status">
                      <StatusPill tone={liveStatusTone(resolveClientLiveStatus(client))}>
                        {formatClientLiveStatus(resolveClientLiveStatus(client), locale)}
                      </StatusPill>
                    </td>
                    <td className="clients-table__cell clients-table__cell--traffic">
                      {formatBytes(Number(client.trafficUsedBytes), locale)}
                    </td>
                    <td className="clients-table__cell clients-table__cell--expiry">
                      <span className="clients-table__date">
                        {formatDateTime(client.expiresAt, text.noExpiry, locale)}
                      </span>
                    </td>
                    <td className="clients-table__cell clients-table__cell--actions">
                      <div className="table-actions table-actions--clients">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={text.qrConfigAria}
                          onClick={async () => {
                            await loadClientDetails(client.id);
                            setIsQrOpen(true);
                          }}
                        >
                          <QrCode size={16} />
                        </button>
                        {!isReadOnly ? (
                          <button
                            className={`button button--compact ${
                              isClientManuallyBlocked(client.status) ? '' : 'button--danger'
                            }`}
                            type="button"
                            aria-label={
                              isClientManuallyBlocked(client.status)
                                ? text.unblockClientAria
                                : text.blockClientAria
                            }
                            onClick={() => void handleToggleClient(client)}
                          >
                            {isClientManuallyBlocked(client.status) ? (
                              <LockOpen size={16} />
                            ) : (
                              <Lock size={16} />
                            )}
                            <span
                              className="table-actions__label"
                              title={isClientManuallyBlocked(client.status) ? text.unblock : text.block}
                            >
                              {isClientManuallyBlocked(client.status) ? text.unblock : text.block}
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && clients.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">{text.noClients}</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <SectionCard
            title={selectedClient ? selectedClient.displayName : text.clientCard}
            subtitle={
              selectedClient
                ? `${formatClientLiveStatus(resolveClientLiveStatus(selectedClient), locale)} • ${selectedClient.uuid}`
                : text.selectClient
            }
          >
            {selectedClient ? (
              <div className="detail-stack">
                <div className="stat-grid">
                  <div className="stat-card">
                    <span>{text.used}</span>
                    <strong>{formatBytes(Number(selectedClient.trafficUsedBytes), locale)}</strong>
                  </div>
                  <div className="stat-card">
                    <span>{text.remaining}</span>
                    <strong>
                      {selectedClient.remainingTrafficBytes
                        ? formatBytes(Number(selectedClient.remainingTrafficBytes), locale)
                        : text.noLimit}
                    </strong>
                  </div>
                  <div className="stat-card">
                    <span>{text.connections}</span>
                    <strong>{selectedClient.activeConnections}</strong>
                  </div>
                  <div className="stat-card">
                    <span>{text.deviceLimit}</span>
                    <strong>
                      {selectedClient.deviceLimit === null ? text.noLimit : selectedClient.deviceLimit}
                    </strong>
                  </div>
                  <div className="stat-card">
                    <span>{text.ipLimit}</span>
                    <strong>{selectedClient.ipLimit === null ? text.noLimit : selectedClient.ipLimit}</strong>
                  </div>
                </div>

                <div className="toolbar__actions wrap-actions">
                  <button className="button" type="button" onClick={() => setIsQrOpen(true)}>
                    {text.showQr}
                  </button>
                  {!isReadOnly ? (
                    <>
                      <button
                        className="button"
                        type="button"
                        onClick={() => void handleExtendClient(selectedClient.id)}
                      >
                        {text.extend30}
                      </button>
                      <button
                        className="button"
                        type="button"
                        onClick={() => void handleResetTraffic(selectedClient.id)}
                      >
                        {text.resetTraffic}
                      </button>
                      <button
                        className="button"
                        type="button"
                        onClick={() => void handleToggleClient(selectedClient)}
                      >
                        {isClientManuallyBlocked(selectedClient.status) ? text.unblock : text.block}
                      </button>
                      <button
                        className="button button--danger"
                        type="button"
                        onClick={() => void handleDeleteClient(selectedClient.id)}
                      >
                        {text.delete}
                      </button>
                    </>
                  ) : null}
                </div>

                {!isReadOnly ? (
                  <form className="inline-form" onSubmit={(event) => void handleSaveClient(event)}>
                  <div className="field-grid">
                    <label className="login-form__field">
                      <span>{text.clientName}</span>
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
                      <span>{text.access}</span>
                      <select
                        value={editFormState.accessStatus}
                        onChange={(event) =>
                          setEditFormState((current) => ({
                            ...current,
                            accessStatus: event.target.value as EditClientFormState['accessStatus'],
                          }))
                        }
                      >
                        <option value="ACTIVE">{formatClientAccessStatus('ACTIVE', locale)}</option>
                        <option value="DISABLED">{formatClientAccessStatus('DISABLED', locale)}</option>
                      </select>
                    </label>
                    <label className="login-form__field">
                      <span>{text.expiryDate}</span>
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
                      <span>{text.trafficLimitGb}</span>
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
                      <span>{text.deviceLimit}</span>
                      <input
                        type="number"
                        min="1"
                        placeholder={text.noLimit}
                        value={editFormState.deviceLimit}
                        onChange={(event) =>
                          setEditFormState((current) => ({
                            ...current,
                            deviceLimit: event.target.value,
                          }))
                        }
                      />
                      <small className="form-hint">{text.limitHint}</small>
                    </label>
                    <label className="login-form__field">
                      <span>{text.ipLimit}</span>
                      <input
                        type="number"
                        min="1"
                        placeholder={text.noLimit}
                        value={editFormState.ipLimit}
                        onChange={(event) =>
                          setEditFormState((current) => ({
                            ...current,
                            ipLimit: event.target.value,
                          }))
                        }
                      />
                      <small className="form-hint">
                        {text.limitHint} {text.ipLimitHint}
                      </small>
                    </label>
                  </div>

                  <label className="login-form__field">
                    <span>{text.tagsComma}</span>
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
                    <span>{text.note}</span>
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
                    <span>{text.unlimitedTraffic}</span>
                  </label>

                  <div className="toolbar__actions">
                    <button
                      className="button button--primary"
                      type="submit"
                      disabled={isSavingClient}
                    >
                      <Save size={16} />
                      {isSavingClient ? text.saving : text.saveChanges}
                    </button>
                  </div>
                  </form>
                ) : null}

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
                            {text.copy}
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
                            {text.download}
                          </button>
                        </div>
                      </div>
                      <code>{subscriptionBundle.config.subscriptionUrl}</code>
                    </div>

                    <div className="mono-card">
                      <div className="mono-card__header">
                        <strong>{text.vlessLink}</strong>
                        <button
                          className="button"
                          type="button"
                          onClick={() => void copyText(subscriptionBundle.config.uri)}
                        >
                          {text.copy}
                        </button>
                      </div>
                      <code>{subscriptionBundle.config.uri}</code>
                    </div>

                    <ul className="feature-list">
                      {subscriptionBundle.instructions.map((item) => (
                        <li key={item}>{translateSubscriptionInstruction(item, locale)}</li>
                      ))}
                    </ul>

                    <div className="feature-list__card">
                      <strong>{text.appGuides}</strong>
                      <span>
                        {text.appGuidesText}{' '}
                        <Link to="/help">
                          <strong>{text.help}</strong>
                        </Link>
                        .
                      </span>
                    </div>
                  </div>
                ) : null}

                <SectionCard title={text.usageHistory} subtitle={text.usageHistorySubtitle}>
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
                              <strong>{formatDateTime(bucket.date, text.notAvailable, locale)}</strong>
                              <span>{formatBytes(Number(bucket.totalBytes), locale)}</span>
                            </div>
                            <div className="history-row__bar">
                              <span style={{ width }} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="empty-state">{text.historyEmpty}</div>
                    )}
                  </div>
                </SectionCard>
              </div>
            ) : (
              <div className="empty-state">{text.selectClientEmpty}</div>
            )}
          </SectionCard>
        </div>
      </SectionCard>

      <Modal
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        title={selectedClient ? text.connectionTitle(selectedClient.displayName) : text.qrConfig}
      >
        {subscriptionBundle ? (
          <div className="detail-stack">
            <div className="qr-shell">
              {qrImageUrl ? (
                <img alt={text.qrAlt} src={qrImageUrl} />
              ) : (
                <div>{text.generatingQr}</div>
              )}
            </div>

            <div className="toolbar__actions wrap-actions">
              <button
                className="button"
                type="button"
                onClick={() => void copyText(subscriptionBundle.config.subscriptionUrl)}
              >
                {text.copySubscriptionUrl}
              </button>
              <button
                className="button"
                type="button"
                onClick={() => void copyText(subscriptionBundle.config.uri)}
              >
                {text.copyVlessLink}
              </button>
            </div>

            <ul className="feature-list">
              {subscriptionBundle.instructions.map((item) => (
                <li key={item}>{translateSubscriptionInstruction(item, locale)}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="empty-state">{text.clientConfigNotLoaded}</div>
        )}
      </Modal>

      <Modal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} title={text.importClients}>
        <div className="detail-stack">
          <p>{text.importHint}</p>

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
            <span>{text.overwriteExisting}</span>
          </label>

          <div className="toolbar__actions wrap-actions">
            <button
              className="button button--primary"
              type="button"
              onClick={() => void handleImportClients()}
              disabled={isImporting || importPayload.trim().length === 0}
            >
              {isImporting ? text.importing : text.runImport}
            </button>
            <button className="button" type="button" onClick={() => setIsImportOpen(false)}>
              {text.cancel}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
