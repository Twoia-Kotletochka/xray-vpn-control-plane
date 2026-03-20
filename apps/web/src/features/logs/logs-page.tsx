import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import type {
  LogContentResponse,
  LogSourceListResponse,
  LogSourceRecord,
} from '../../lib/api-types';
import { formatBytes, formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

export function LogsPage() {
  const { apiFetch } = useAuth();
  const [sources, setSources] = useState<LogSourceRecord[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [content, setContent] = useState<LogContentResponse | null>(null);
  const [lines, setLines] = useState('200');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSource = useCallback(
    async (sourceId: string, linesValue: string) => {
      setIsRefreshing(true);
      setError(null);

      try {
        const response = await apiFetch<LogContentResponse>(
          `/api/logs/${sourceId}?lines=${encodeURIComponent(linesValue)}`,
        );
        setContent(response);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить лог.');
      } finally {
        setIsRefreshing(false);
      }
    },
    [apiFetch],
  );

  const loadSources = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch<LogSourceListResponse>('/api/logs/sources');
      const nextSelected =
        response.items.find((item) => item.available)?.id ?? response.items[0]?.id ?? '';

      setSources(response.items);
      setSelectedSourceId((current) => current || nextSelected);

      if (nextSelected) {
        await loadSource(nextSelected, lines);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Не удалось загрузить список логов.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, lines, loadSource]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  return (
    <div className="page">
      <PageHeader
        title="Логи"
        description="Панель читает только заранее разрешённые файлы: API, Xray и Caddy. Это даёт удобный triage без доступа приложения к journald или системным сокетам."
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <div className="split-grid">
        <SectionCard
          title="Источники"
          subtitle="Выберите нужный поток и количество последних строк для tail-просмотра."
        >
          <div className="logs-source-list">
            {sources.map((source) => (
              <button
                key={source.id}
                className={`logs-source-button ${selectedSourceId === source.id ? 'logs-source-button--active' : ''}`}
                type="button"
                onClick={() => {
                  setSelectedSourceId(source.id);
                  void loadSource(source.id, lines);
                }}
              >
                <strong>{source.label}</strong>
                <span>{source.available ? source.path : 'Файл пока не создан'}</span>
              </button>
            ))}

            {!isLoading && sources.length === 0 ? (
              <div className="empty-state">Источники логов пока не определены.</div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Просмотр"
          subtitle="Tail по файлу без shell-доступа. Подходит для быстрой диагностики после деплоя или изменений Xray."
        >
          <div className="toolbar">
            <label className="login-form__field">
              <span>Количество строк</span>
              <input
                type="number"
                min="50"
                max="2000"
                value={lines}
                onChange={(event) => setLines(event.target.value)}
              />
            </label>

            <div className="toolbar__actions">
              <button
                className="button"
                type="button"
                onClick={() => selectedSourceId && void loadSource(selectedSourceId, lines)}
                disabled={!selectedSourceId || isRefreshing}
              >
                <RefreshCw size={16} />
                {isRefreshing ? 'Обновляем...' : 'Обновить tail'}
              </button>
            </div>
          </div>

          {content ? (
            <div className="detail-stack">
              <dl className="detail-list">
                <div>
                  <dt>Источник</dt>
                  <dd>{content.label}</dd>
                </div>
                <div>
                  <dt>Файл</dt>
                  <dd className="detail-list__mono">{content.path}</dd>
                </div>
                <div>
                  <dt>Размер</dt>
                  <dd>{content.sizeBytes ? formatBytes(content.sizeBytes) : '—'}</dd>
                </div>
                <div>
                  <dt>Обновлён</dt>
                  <dd>{formatDateTime(content.updatedAt, '—')}</dd>
                </div>
              </dl>

              <pre className="mono-output">{content.content || 'Лог пока пуст.'}</pre>
            </div>
          ) : (
            <div className="empty-state">Выберите источник логов, чтобы увидеть tail.</div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
