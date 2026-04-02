import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileUp,
  Lock,
  LockOpen,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Modal } from '../../components/ui/modal';
import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { Skeleton } from '../../components/ui/skeleton';
import { StatusPill } from '../../components/ui/status-pill';
import { Toast } from '../../components/ui/toast';
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

type ClientStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
type ClientSortKey = 'displayName' | 'trafficUsedBytes' | 'expiresAt' | 'lastSeenAt' | 'activeConnections';
type SortDirection = 'asc' | 'desc';

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

function resolveTrafficProgress(client: ClientRecord) {
  const usedBytes = Number(client.trafficUsedBytes);
  const limitBytes = client.trafficLimitBytes ? Number(client.trafficLimitBytes) : null;

  if (!Number.isFinite(usedBytes) || client.isTrafficUnlimited || !limitBytes || limitBytes <= 0) {
    return {
      percent: 0,
      tone: 'muted' as const,
      remainingBytes: client.remainingTrafficBytes ? Number(client.remainingTrafficBytes) : null,
    };
  }

  const percent = Math.max(0, Math.min(100, (usedBytes / limitBytes) * 100));

  return {
    percent,
    tone: percent >= 90 ? ('danger' as const) : percent >= 75 ? ('warning' as const) : ('success' as const),
    remainingBytes: client.remainingTrafficBytes ? Number(client.remainingTrafficBytes) : null,
  };
}

function compareValues(left: string | number, right: string | number, direction: SortDirection) {
  const comparison = left === right ? 0 : left > right ? 1 : -1;
  return direction === 'asc' ? comparison : comparison * -1;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const selectedClientIdRef = useRef<string | null>(null);
  const listRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const initialSearch = searchParams.get('search') ?? '';
  const initialPage = Number(searchParams.get('page') ?? '1');
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientDetailResponse | null>(null);
  const [subscriptionBundle, setSubscriptionBundle] = useState<ClientSubscriptionBundle | null>(
    null,
  );
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1);
  const [pageSize, setPageSize] = useState(25);
  const [totalClients, setTotalClients] = useState(0);
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>('ALL');
  const [sortKey, setSortKey] = useState<ClientSortKey>('lastSeenAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' | 'info' } | null>(
    null,
  );
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isClientCardOpen, setIsClientCardOpen] = useState(false);
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
  const totalPages = Math.max(1, Math.ceil(totalClients / pageSize));
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
    copyError: isEnglish ? 'Failed to copy the value.' : 'Не удалось скопировать значение.',
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
    lastSeen: isEnglish ? 'Last seen' : 'Последний онлайн',
    access: isEnglish ? 'Access' : 'Доступ',
    traffic: isEnglish ? 'Traffic' : 'Трафик',
    expiry: isEnglish ? 'Expiry' : 'Срок',
    actions: isEnglish ? 'Actions' : 'Действия',
    noClients: isEnglish ? 'No clients match the current filter yet.' : 'По текущему фильтру клиентов пока нет.',
    loadingClients: isEnglish ? 'Loading clients...' : 'Загружаем клиентов...',
    clientCard: isEnglish ? 'Client card' : 'Карточка клиента',
    selectClient: isEnglish
      ? 'Choose a client from the table to view details and config.'
      : 'Выберите клиента из таблицы, чтобы увидеть детали и конфиг.',
    used: isEnglish ? 'Used' : 'Использовано',
    remaining: isEnglish ? 'Remaining' : 'Остаток',
    noLimit: isEnglish ? 'No limit' : 'Без лимита',
    connections: isEnglish ? 'Connections' : 'Подключения',
    quickActions: isEnglish ? 'Quick actions' : 'Быстрые действия',
    quickActionsHint: isEnglish
      ? 'Copy config, suspend access, or reset limits without leaving the workspace.'
      : 'Копируйте конфиг, приостанавливайте доступ и сбрасывайте лимиты без переходов по страницам.',
    extend30: isEnglish ? 'Extend by 30 days' : 'Продлить на 30 дней',
    resetTraffic: isEnglish ? 'Reset traffic' : 'Сбросить трафик',
    unblock: isEnglish ? 'Unblock' : 'Разблокировать',
    block: isEnglish ? 'Block' : 'Заблокировать',
    showQr: isEnglish ? 'Show QR' : 'Показать QR',
    delete: isEnglish ? 'Delete' : 'Удалить',
    copiedSubscription: (name: string) =>
      isEnglish ? `Subscription copied for ${name}.` : `URL подписки скопирован для ${name}.`,
    copiedVless: (name: string) =>
      isEnglish ? `VLESS link copied for ${name}.` : `VLESS ссылка скопирована для ${name}.`,
    clientUpdated: (name: string) =>
      isEnglish ? `${name} was updated.` : `Клиент ${name} обновлён.`,
    clientCreated: (name: string) =>
      isEnglish ? `${name} was created.` : `Клиент ${name} создан.`,
    clientExtended: (name: string) =>
      isEnglish ? `${name} was extended by 30 days.` : `Клиент ${name} продлён на 30 дней.`,
    trafficResetDone: (name: string) =>
      isEnglish ? `Traffic was reset for ${name}.` : `Трафик клиента ${name} сброшен.`,
    accessUpdated: (name: string, blocked: boolean) =>
      isEnglish
        ? `${name} is now ${blocked ? 'blocked' : 'active'}.`
        : `Клиент ${name} теперь ${blocked ? 'заблокирован' : 'активен'}.`,
    clientDeleted: (name: string) =>
      isEnglish ? `${name} was deleted.` : `Клиент ${name} удалён.`,
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
    subscriptionUrl: isEnglish ? 'Subscription URL' : 'URL подписки',
    vlessLink: isEnglish ? 'VLESS link' : 'VLESS ссылка',
    appGuides: isEnglish ? 'Client app guides' : 'Инструкции по приложениям',
    appGuidesText: isEnglish
      ? 'Recommended clients for Windows, macOS, Android, and iPhone/iPad are available in the'
      : 'Рекомендованные клиенты для Windows, macOS, Android и iPhone/iPad вынесены в раздел',
    help: isEnglish ? 'Help' : 'Помощь',
    identityTitle: isEnglish ? 'Connection identity' : 'Идентификаторы подключения',
    identitySubtitle: isEnglish
      ? 'Core metadata for runtime routing and subscription delivery.'
      : 'Базовые идентификаторы для runtime-маршрутизации и выдачи подписки.',
    identifier: isEnglish ? 'UUID' : 'UUID',
    transportProfileLabel: isEnglish ? 'Transport profile' : 'Транспортный профиль',
    inboundLabel: isEnglish ? 'Inbound tag' : 'Inbound tag',
    manualAccess: isEnglish ? 'Manual access' : 'Ручной доступ',
    deliveryKitTitle: isEnglish ? 'Delivery kit' : 'Комплект подключения',
    deliveryKitSubtitle: isEnglish
      ? 'Everything needed to copy, import, or troubleshoot this client config.'
      : 'Всё нужное для копирования, импорта и проверки конфига этого клиента.',
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
    filterAll: isEnglish ? 'All' : 'Все',
    filterActive: isEnglish ? 'Online' : 'Онлайн',
    filterInactive: isEnglish ? 'Offline' : 'Офлайн',
    filterBlocked: isEnglish ? 'Blocked' : 'Заблокированные',
    results: (shown: number, total: number) =>
      isEnglish ? `Showing ${shown} of ${total}` : `Показано ${shown} из ${total}`,
    currentPageScope: isEnglish ? 'Filtered on the current page' : 'Фильтр применён к текущей странице',
    pageOf: (current: number, total: number) =>
      isEnglish ? `Page ${current} of ${total}` : `Страница ${current} из ${total}`,
    previousPage: isEnglish ? 'Previous page' : 'Предыдущая страница',
    nextPage: isEnglish ? 'Next page' : 'Следующая страница',
    sortBy: isEnglish ? 'Sort by' : 'Сортировка',
    sortByName: isEnglish ? 'Name' : 'Имя',
    sortByTraffic: isEnglish ? 'Traffic' : 'Трафик',
    sortByExpiry: isEnglish ? 'Expiry' : 'Срок',
    sortBySeen: isEnglish ? 'Last seen' : 'Последний онлайн',
    sortByConnections: isEnglish ? 'Connections' : 'Подключения',
    ascending: isEnglish ? 'Ascending' : 'По возрастанию',
    descending: isEnglish ? 'Descending' : 'По убыванию',
    tableSubtitle: isEnglish
      ? 'Search, filter, and act directly from the list. Click a row to open the client card.'
      : 'Ищи, фильтруй и действуй прямо из таблицы. Клик по строке открывает карточку клиента.',
    trafficLimit: isEnglish ? 'Traffic cap' : 'Лимит трафика',
    unlimited: isEnglish ? 'Unlimited' : 'Без лимита',
    rowCopyConfig: isEnglish ? 'Copy config' : 'Скопировать конфиг',
    pageSize: isEnglish ? 'Rows' : 'Строк',
    chooseRow: isEnglish ? 'Choose a row' : 'Выберите строку',
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
    setIsClientCardOpen(false);
    setSelectedClient(null);
    setSubscriptionBundle(null);
    setEditFormState(emptyEditFormState);
  }, []);

  const showToast = useCallback(
    (message: string, tone: 'success' | 'danger' | 'info' = 'success') => {
      setToast({ message, tone });
    },
    [],
  );

  const loadClientDetails = useCallback(
    async (clientId: string) => {
      const requestId = ++detailRequestIdRef.current;
      selectedClientIdRef.current = clientId;

      const [client, bundle] = await Promise.all([
        apiFetch<ClientDetailResponse>(`/api/clients/${clientId}`),
        apiFetch<ClientSubscriptionBundle>(`/api/subscriptions/client/${clientId}`),
      ]);

      if (requestId !== detailRequestIdRef.current || selectedClientIdRef.current !== clientId) {
        return null;
      }

      setSelectedClient(client);
      setSubscriptionBundle(bundle);
      setEditFormState(mapClientToEditState(client));
      return { bundle, client };
    },
    [apiFetch],
  );

  const closeClientCard = useCallback(() => {
    setIsQrOpen(false);
    clearSelectedClient();
  }, [clearSelectedClient]);

  const openClientCard = useCallback(
    async (clientId: string) => {
      const details = await loadClientDetails(clientId);

      if (details) {
        setIsClientCardOpen(true);
      }

      return details;
    },
    [loadClientDetails],
  );

  const loadClients = useCallback(
    async (searchValue: string, pageValue: number, preferredSelectedId?: string) => {
      const requestId = ++listRequestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiFetch<ClientListResponse>(
          `/api/clients?page=${pageValue}&pageSize=${pageSize}&search=${encodeURIComponent(searchValue)}`,
        );

        if (requestId !== listRequestIdRef.current) {
          return;
        }

        setClients(response.items);
        setTotalClients(response.pagination.total);

        if (response.items.length === 0) {
          clearSelectedClient();
          return;
        }

        const currentSelectedId = preferredSelectedId ?? selectedClientIdRef.current;
        const hasSelectedClient =
          currentSelectedId !== null && response.items.some((item) => item.id === currentSelectedId);

        if (isClientCardOpen && currentSelectedId && hasSelectedClient) {
          await loadClientDetails(currentSelectedId);
        } else if (currentSelectedId && !hasSelectedClient) {
          clearSelectedClient();
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
    [apiFetch, clearSelectedClient, isClientCardOpen, loadClientDetails, pageSize, text.loadError],
  );

  useEffect(() => {
    void loadClients(deferredSearch, page);
  }, [deferredSearch, loadClients, page]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const nextSearchParams = new URLSearchParams();

    if (search.trim()) {
      nextSearchParams.set('search', search.trim());
    }

    if (page > 1) {
      nextSearchParams.set('page', String(page));
    }

    if (isComposerOpen && !isReadOnly) {
      nextSearchParams.set('composer', '1');
    }

    setSearchParams(nextSearchParams, { replace: true });
  }, [isComposerOpen, isReadOnly, page, search, setSearchParams]);

  useEffect(() => {
    const nextSearch = searchParams.get('search') ?? '';
    const nextPage = Number(searchParams.get('page') ?? '1');

    if (nextSearch !== search) {
      setSearch(nextSearch);
    }

    if (Number.isFinite(nextPage) && nextPage > 0 && nextPage !== page) {
      setPage(nextPage);
    }

    if (searchParams.get('composer') === '1' && !isReadOnly) {
      setIsComposerOpen(true);
    }
  }, [isReadOnly, page, search, searchParams]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 2600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toast]);

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
      setSearch('');
      setPage(1);
      showToast(text.clientCreated(created.displayName));
      await loadClients('', 1);
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

      showToast(text.clientUpdated(editFormState.displayName));
      await loadClients(search, page, selectedClient.id);
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

    showToast(text.accessUpdated(client.displayName, nextStatus === 'DISABLED'));
    await loadClients(search, page, client.id);
  };

  const handleExtendClient = async (clientId: string) => {
    await apiFetch(`/api/clients/${clientId}/extend`, {
      method: 'POST',
      body: JSON.stringify({
        days: 30,
      }),
    });

    const targetName =
      selectedClient?.id === clientId
        ? selectedClient.displayName
        : clients.find((item) => item.id === clientId)?.displayName ?? clientId;
    showToast(text.clientExtended(targetName));
    await loadClients(search, page, clientId);
  };

  const handleResetTraffic = async (clientId: string) => {
    await apiFetch(`/api/clients/${clientId}/reset-traffic`, {
      method: 'POST',
    });

    const targetName =
      selectedClient?.id === clientId
        ? selectedClient.displayName
        : clients.find((item) => item.id === clientId)?.displayName ?? clientId;
    showToast(text.trafficResetDone(targetName));
    await loadClients(search, page, clientId);
  };

  const handleDeleteClient = async (clientId: string) => {
    const targetName =
      selectedClient?.id === clientId
        ? selectedClient.displayName
        : clients.find((item) => item.id === clientId)?.displayName ?? clientId;

    if (!window.confirm(text.deleteConfirm)) {
      return;
    }

    await apiFetch(`/api/clients/${clientId}`, {
      method: 'DELETE',
    });

    setIsQrOpen(false);
    showToast(text.clientDeleted(targetName));
    await loadClients(search, page);
  };

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(successMessage);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : text.copyError);
      showToast(text.copyError, 'danger');
    }
  };

  const handleExportClients = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const payload = await apiFetch<ClientExportBundle>('/api/clients/export');
      const stamp = new Date().toISOString().slice(0, 10);

      await downloadText(`server-vpn-clients-${stamp}.json`, JSON.stringify(payload, null, 2));
      showToast(text.exportNotice(payload.items.length));
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

      showToast(text.importDone(result.created, result.updated, result.skipped));
      setIsImportOpen(false);
      setImportPayload('');
      setOverwriteExisting(false);
      await loadClients(search, page);
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

  const statusOptions = [
    { key: 'ALL' as const, label: text.filterAll },
    { key: 'ACTIVE' as const, label: text.filterActive },
    { key: 'INACTIVE' as const, label: text.filterInactive },
    { key: 'BLOCKED' as const, label: text.filterBlocked },
  ];

  const sortOptions = [
    { key: 'lastSeenAt' as const, label: text.sortBySeen },
    { key: 'trafficUsedBytes' as const, label: text.sortByTraffic },
    { key: 'expiresAt' as const, label: text.sortByExpiry },
    { key: 'activeConnections' as const, label: text.sortByConnections },
    { key: 'displayName' as const, label: text.sortByName },
  ];

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      if (statusFilter === 'ALL') {
        return true;
      }

      return resolveClientLiveStatus(client) === statusFilter;
    });
  }, [clients, statusFilter]);

  const sortedClients = useMemo(() => {
    return [...filteredClients].sort((left, right) => {
      if (sortKey === 'displayName') {
        return compareValues(left.displayName.localeCompare(right.displayName), 0, sortDirection);
      }

      if (sortKey === 'trafficUsedBytes') {
        return compareValues(
          Number(left.trafficUsedBytes),
          Number(right.trafficUsedBytes),
          sortDirection,
        );
      }

      if (sortKey === 'expiresAt') {
        return compareValues(
          left.expiresAt ? new Date(left.expiresAt).getTime() : 0,
          right.expiresAt ? new Date(right.expiresAt).getTime() : 0,
          sortDirection,
        );
      }

      if (sortKey === 'activeConnections') {
        return compareValues(left.activeConnections, right.activeConnections, sortDirection);
      }

      return compareValues(
        left.lastSeenAt ? new Date(left.lastSeenAt).getTime() : 0,
        right.lastSeenAt ? new Date(right.lastSeenAt).getTime() : 0,
        sortDirection,
      );
    });
  }, [filteredClients, sortDirection, sortKey]);

  const quickStats = useMemo(() => {
    const nextStats = {
      active: 0,
      blocked: 0,
      expiringSoon: 0,
      trafficUsedBytes: 0,
    };
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    for (const client of filteredClients) {
      const liveStatus = resolveClientLiveStatus(client);

      if (liveStatus === 'ACTIVE') {
        nextStats.active += 1;
      }

      if (liveStatus === 'BLOCKED') {
        nextStats.blocked += 1;
      }

      if (client.expiresAt) {
        const expiresAt = new Date(client.expiresAt).getTime();

        if (expiresAt >= now && expiresAt - now <= sevenDays) {
          nextStats.expiringSoon += 1;
        }
      }

      nextStats.trafficUsedBytes += Number(client.trafficUsedBytes);
    }

    return nextStats;
  }, [filteredClients]);
  const selectedTrafficProgress = selectedClient ? resolveTrafficProgress(selectedClient) : null;
  const resultsBaseline = statusFilter === 'ALL' ? totalClients : clients.length;

  useEffect(() => {
    if (sortedClients.length === 0) {
      clearSelectedClient();
      return;
    }

    if (selectedClient && !sortedClients.some((client) => client.id === selectedClient.id)) {
      clearSelectedClient();
    }
  }, [clearSelectedClient, selectedClient, sortedClients]);

  const headerActionLabel = !isReadOnly ? (isComposerOpen ? text.hideForm : text.newClient) : undefined;

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

      <SectionCard title={text.managementTitle} subtitle={text.managementSubtitle}>
        <div className="workspace-toolbar">
          <label className="toolbar__search workspace-toolbar__search">
            <Search size={16} />
            <input
              placeholder={text.searchPlaceholder}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <div className="workspace-toolbar__controls">
            <div className="filter-chip-group" role="group" aria-label={text.status}>
              {statusOptions.map((option) => (
                <button
                  key={option.key}
                  className={`filter-chip ${statusFilter === option.key ? 'filter-chip--active' : ''}`}
                  type="button"
                  aria-pressed={statusFilter === option.key}
                  onClick={() => setStatusFilter(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="toolbar__actions workspace-toolbar__actions">
              <div className="workspace-toolbar__fields">
                <label className="toolbar-select toolbar-select--wide">
                  <span>{text.sortBy}</span>
                  <select
                    value={sortKey}
                    onChange={(event) => setSortKey(event.target.value as ClientSortKey)}
                  >
                    {sortOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button button--ghost button--compact"
                  type="button"
                  onClick={() =>
                    setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
                  }
                >
                  {sortDirection === 'desc' ? text.descending : text.ascending}
                </button>
                <label className="toolbar-select toolbar-select--narrow">
                  <span>{text.pageSize}</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    {[25, 50, 100].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="workspace-toolbar__bulk-actions">
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setPage(1);
                    setStatusFilter('ALL');
                  }}
                >
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
                    <button
                      className="button"
                      type="button"
                      onClick={() => importFileRef.current?.click()}
                    >
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
            </div>
          </div>
          <input
            ref={importFileRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImportFile(event)}
          />
        </div>

        <div className="client-summary-strip">
          <div className="client-summary-card">
            <span>{text.client}</span>
            <strong>{filteredClients.length}</strong>
            <p>{text.results(filteredClients.length, resultsBaseline)}</p>
          </div>
          <div className="client-summary-card">
            <span>{text.filterActive}</span>
            <strong>{quickStats.active}</strong>
            <p>{text.connections}</p>
          </div>
          <div className="client-summary-card">
            <span>{text.filterBlocked}</span>
            <strong>{quickStats.blocked}</strong>
            <p>{text.access}</p>
          </div>
          <div className="client-summary-card">
            <span>{text.traffic}</span>
            <strong>{formatBytes(quickStats.trafficUsedBytes, locale)}</strong>
            <p>{text.filterAll}</p>
          </div>
          <div className="client-summary-card">
            <span>{text.expiry}</span>
            <strong>{quickStats.expiringSoon}</strong>
            <p>{locale === 'en' ? 'expiring in 7 days' : 'истекают в 7 дней'}</p>
          </div>
        </div>

        {!isReadOnly && isComposerOpen ? (
          <div className="workspace-panel workspace-panel--composer">
            <div className="workspace-panel__header">
              <div>
                <strong>{text.addClient}</strong>
                <p>{text.quickActionsHint}</p>
              </div>
            </div>

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
          </div>
        ) : null}

        <div className="split-grid split-grid--clients">
          <div className="client-list-panel">
            <div className="client-list-panel__header">
              <div>
                <strong>{text.results(sortedClients.length, resultsBaseline)}</strong>
                <span>
                  {statusFilter === 'ALL'
                    ? text.pageOf(page, totalPages)
                    : text.currentPageScope}
                </span>
                <span>{text.tableSubtitle}</span>
              </div>
              <div className="data-pagination">
                <span>{text.pageOf(page, totalPages)}</span>
                <div className="data-pagination__controls">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={text.previousPage}
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={text.nextPage}
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="table-shell table-shell--clients">
              <table className="data-table clients-table">
                <colgroup>
                  <col className="clients-table__col clients-table__col--client" />
                  <col className="clients-table__col clients-table__col--status" />
                  <col className="clients-table__col clients-table__col--traffic" />
                  <col className="clients-table__col clients-table__col--expiry" />
                  <col className="clients-table__col clients-table__col--expiry" />
                  <col className="clients-table__col clients-table__col--actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{text.client}</th>
                    <th>{text.status}</th>
                    <th>{text.traffic}</th>
                    <th>{text.lastSeen}</th>
                    <th>{text.expiry}</th>
                    <th>{text.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && clients.length === 0
                    ? Array.from({ length: 6 }).map((_, index) => (
                        <tr key={`client-skeleton-${index}`}>
                          <td colSpan={6}>
                            <Skeleton className="skeleton--table" />
                          </td>
                        </tr>
                      ))
                    : sortedClients.map((client) => {
                        const liveStatus = resolveClientLiveStatus(client);
                        const trafficProgress = resolveTrafficProgress(client);

                        return (
                          <tr
                            key={client.id}
                            className={`table-row--interactive ${
                              isClientCardOpen && selectedClient?.id === client.id ? 'table-row--selected' : ''
                            }`}
                            tabIndex={0}
                            aria-selected={isClientCardOpen && selectedClient?.id === client.id}
                            onClick={() => void openClientCard(client.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                void openClientCard(client.id);
                              }
                            }}
                          >
                            <td className="clients-table__cell clients-table__cell--client">
                              <div className="table-main">
                                <strong>{client.displayName}</strong>
                                <span>{client.emailTag}</span>
                              </div>
                            </td>
                            <td className="clients-table__cell clients-table__cell--status">
                              <div className="client-status-cell">
                                <StatusPill tone={liveStatusTone(liveStatus)}>
                                  {formatClientLiveStatus(liveStatus, locale)}
                                </StatusPill>
                                <span>
                                  {text.connections}: {client.activeConnections}
                                </span>
                              </div>
                            </td>
                            <td className="clients-table__cell clients-table__cell--traffic">
                              <div className="traffic-meter">
                                <div className="traffic-meter__meta">
                                  <strong>{formatBytes(Number(client.trafficUsedBytes), locale)}</strong>
                                  <span>
                                    {client.isTrafficUnlimited || !client.trafficLimitBytes
                                      ? text.unlimited
                                      : formatBytes(Number(client.trafficLimitBytes), locale)}
                                  </span>
                                </div>
                                <div
                                  className={`traffic-meter__bar traffic-meter__bar--${trafficProgress.tone}`}
                                >
                                  <span
                                    style={{
                                      width: `${Math.max(
                                        trafficProgress.percent,
                                        trafficProgress.percent > 0 ? 10 : 0,
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="clients-table__cell clients-table__cell--expiry">
                              <span className="clients-table__date">
                                {formatDateTime(client.lastSeenAt, text.notAvailable, locale)}
                              </span>
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
                                  title={text.rowCopyConfig}
                                  aria-label={text.rowCopyConfig}
                                  onClick={async (event) => {
                                    event.stopPropagation();
                                    const details = await loadClientDetails(client.id);

                                    if (details) {
                                      await copyText(
                                        details.bundle.config.uri,
                                        text.copiedVless(details.client.displayName),
                                      );
                                    }
                                  }}
                                >
                                  <Copy size={16} />
                                </button>
                                <button
                                  className="icon-button"
                                  type="button"
                                  title={text.qrConfig}
                                  aria-label={text.qrConfigAria}
                                  onClick={async (event) => {
                                    event.stopPropagation();
                                    const details = await loadClientDetails(client.id);

                                    if (details) {
                                      setIsQrOpen(true);
                                    }
                                  }}
                                >
                                  <QrCode size={16} />
                                </button>
                                {!isReadOnly ? (
                                  <>
                                    <button
                                      className="icon-button icon-button--danger"
                                      type="button"
                                      title={text.delete}
                                      aria-label={text.delete}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleDeleteClient(client.id);
                                      }}
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                    <button
                                      className={`button button--compact ${
                                        isClientManuallyBlocked(client.status) ? '' : 'button--danger'
                                      } table-actions__toggle`}
                                      type="button"
                                      aria-label={
                                        isClientManuallyBlocked(client.status)
                                          ? text.unblockClientAria
                                          : text.blockClientAria
                                      }
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleToggleClient(client);
                                      }}
                                    >
                                      {isClientManuallyBlocked(client.status) ? (
                                        <LockOpen size={16} />
                                      ) : (
                                        <Lock size={16} />
                                      )}
                                      <span className="table-actions__label">
                                        {isClientManuallyBlocked(client.status) ? text.unblock : text.block}
                                      </span>
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  {!isLoading && sortedClients.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state">{text.noClients}</div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </SectionCard>

      <Toast
        isOpen={Boolean(toast)}
        message={toast?.message ?? ''}
        tone={toast?.tone ?? 'success'}
        onClose={() => setToast(null)}
      />

      <Modal
        isOpen={isClientCardOpen && Boolean(selectedClient)}
        onClose={closeClientCard}
        title={selectedClient?.displayName ?? text.clientCard}
        dialogClassName="modal--client"
        bodyClassName="modal__body--client"
      >
        {selectedClient ? (
          <div className="detail-stack">
            <p className="client-inspector__summary">
              {formatClientLiveStatus(resolveClientLiveStatus(selectedClient), locale)} • {selectedClient.uuid}
            </p>

            <div className="client-inspector__hero">
              <div>
                <StatusPill tone={liveStatusTone(resolveClientLiveStatus(selectedClient))}>
                  {formatClientLiveStatus(resolveClientLiveStatus(selectedClient), locale)}
                </StatusPill>
                <p className="client-inspector__meta">{selectedClient.emailTag}</p>
              </div>
              <div className="client-inspector__meta-block">
                <span>{text.lastSeen}</span>
                <strong>{formatDateTime(selectedClient.lastSeenAt, text.notAvailable, locale)}</strong>
              </div>
            </div>

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
                <strong>{selectedClient.deviceLimit === null ? text.noLimit : selectedClient.deviceLimit}</strong>
              </div>
              <div className="stat-card">
                <span>{text.ipLimit}</span>
                <strong>{selectedClient.ipLimit === null ? text.noLimit : selectedClient.ipLimit}</strong>
              </div>
            </div>

            <div className="workspace-panel workspace-panel--tight">
              <div className="workspace-panel__header">
                <div>
                  <strong>{text.identityTitle}</strong>
                  <p>{text.identitySubtitle}</p>
                </div>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>{text.identifier}</dt>
                  <dd className="detail-list__mono">{selectedClient.uuid}</dd>
                </div>
                <div>
                  <dt>{text.transportProfileLabel}</dt>
                  <dd>{selectedClient.transportProfile}</dd>
                </div>
                <div>
                  <dt>{text.inboundLabel}</dt>
                  <dd>{selectedClient.xrayInboundTag}</dd>
                </div>
                <div>
                  <dt>{text.manualAccess}</dt>
                  <dd>
                    {formatClientAccessStatus(
                      isClientManuallyBlocked(selectedClient.status) ? 'DISABLED' : 'ACTIVE',
                      locale,
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {selectedTrafficProgress ? (
              <div className="workspace-panel workspace-panel--tight">
                <div className="workspace-panel__header">
                  <div>
                    <strong>{text.trafficLimit}</strong>
                    <p>{selectedClient.isTrafficUnlimited ? text.unlimited : text.traffic}</p>
                  </div>
                  <strong>
                    {selectedClient.isTrafficUnlimited || !selectedClient.trafficLimitBytes
                      ? text.unlimited
                      : `${Math.round(selectedTrafficProgress.percent)}%`}
                  </strong>
                </div>
                <div className={`traffic-meter__bar traffic-meter__bar--${selectedTrafficProgress.tone}`}>
                  <span
                    style={{
                      width: `${Math.max(
                        selectedTrafficProgress.percent,
                        selectedTrafficProgress.percent > 0 ? 10 : 0,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div className="workspace-panel workspace-panel--tight">
              <div className="workspace-panel__header">
                <div>
                  <strong>{text.quickActions}</strong>
                  <p>{text.quickActionsHint}</p>
                </div>
              </div>
              <div className="workspace-actions-grid">
                <button className="button" type="button" onClick={() => setIsQrOpen(true)}>
                  <QrCode size={16} />
                  {text.showQr}
                </button>
                {subscriptionBundle ? (
                  <>
                    <button
                      className="button"
                      type="button"
                      onClick={() =>
                        void copyText(
                          subscriptionBundle.config.subscriptionUrl,
                          text.copiedSubscription(selectedClient.displayName),
                        )
                      }
                    >
                      <Copy size={16} />
                      {text.subscriptionUrl}
                    </button>
                    <button
                      className="button"
                      type="button"
                      onClick={() =>
                        void copyText(
                          subscriptionBundle.config.uri,
                          text.copiedVless(selectedClient.displayName),
                        )
                      }
                    >
                      <Copy size={16} />
                      {text.vlessLink}
                    </button>
                  </>
                ) : null}
                {!isReadOnly ? (
                  <>
                    <button className="button" type="button" onClick={() => void handleExtendClient(selectedClient.id)}>
                      {text.extend30}
                    </button>
                    <button className="button" type="button" onClick={() => void handleResetTraffic(selectedClient.id)}>
                      {text.resetTraffic}
                    </button>
                    <button
                      className={`button ${isClientManuallyBlocked(selectedClient.status) ? '' : 'button--danger'}`}
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
            </div>

            {!isReadOnly ? (
              <form className="inline-form inline-form--details" onSubmit={(event) => void handleSaveClient(event)}>
                <div className="workspace-panel workspace-panel--tight">
                  <div className="workspace-panel__header">
                    <div>
                      <strong>{text.access}</strong>
                      <p>{text.limitHint}</p>
                    </div>
                  </div>

                  <div className="field-grid field-grid--details">
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
                    <button className="button button--primary" type="submit" disabled={isSavingClient}>
                      <Save size={16} />
                      {isSavingClient ? text.saving : text.saveChanges}
                    </button>
                  </div>
                </div>
              </form>
            ) : null}

            {subscriptionBundle ? (
              <div className="workspace-panel workspace-panel--tight">
                <div className="workspace-panel__header">
                  <div>
                    <strong>{text.deliveryKitTitle}</strong>
                    <p>{text.deliveryKitSubtitle}</p>
                  </div>
                </div>

                <div className="detail-stack">
                  <div className="mono-card">
                    <div className="mono-card__header">
                      <strong>{text.subscriptionUrl}</strong>
                      <div className="toolbar__actions">
                        <button
                          className="button"
                          type="button"
                          onClick={() =>
                            void copyText(
                              subscriptionBundle.config.subscriptionUrl,
                              text.copiedSubscription(selectedClient.displayName),
                            )
                          }
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
                        onClick={() =>
                          void copyText(
                            subscriptionBundle.config.uri,
                            text.copiedVless(selectedClient.displayName),
                          )
                        }
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
              </div>
            ) : null}

            <div className="workspace-panel workspace-panel--tight">
              <div className="workspace-panel__header">
                <div>
                  <strong>{text.usageHistory}</strong>
                  <p>{text.usageHistorySubtitle}</p>
                </div>
              </div>
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
            </div>
          </div>
        ) : (
          <div className="empty-state">{text.selectClientEmpty}</div>
        )}
      </Modal>

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
                onClick={() =>
                  void copyText(
                    subscriptionBundle.config.subscriptionUrl,
                    text.copiedSubscription(selectedClient?.displayName ?? 'client'),
                  )
                }
              >
                {text.copySubscriptionUrl}
              </button>
              <button
                className="button"
                type="button"
                onClick={() =>
                  void copyText(
                    subscriptionBundle.config.uri,
                    text.copiedVless(selectedClient?.displayName ?? 'client'),
                  )
                }
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
