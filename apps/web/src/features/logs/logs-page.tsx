import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  const [lineFilter, setLineFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
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

  const filteredLines = useMemo(() => {
    if (!content) {
      return [];
    }

    const query = lineFilter.trim().toLowerCase();

    return content.content
      .split('\n')
      .filter((line) => {
        const normalized = line.toLowerCase();
        const levelMatches =
          levelFilter === 'ALL' ||
          (levelFilter === 'ERROR' &&
            (normalized.includes('error') ||
              normalized.includes('exception') ||
              normalized.includes('fatal'))) ||
          (levelFilter === 'WARN' &&
            (normalized.includes('warn') || normalized.includes('warning'))) ||
          (levelFilter === 'INFO' && normalized.includes('info')) ||
          (levelFilter === 'DEBUG' && normalized.includes('debug'));

        if (!levelMatches) {
          return false;
        }

        if (!query) {
          return true;
        }

        return normalized.includes(query);
      });
  }, [content, levelFilter, lineFilter]);

  return (
    <div className="page">
      <PageHeader
        title="Логи"
        description="Tail разрешённых логов API, Xray и Caddy с базовыми фильтрами для быстрой диагностики."
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
          subtitle="Tail по файлу без shell-доступа. Подходит для быстрой диагностики после деплоя и изменений рантайма."
        >
          <div className="toolbar">
            <div className="field-grid">
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
              <label className="login-form__field">
                <span>Уровень</span>
                <select
                  value={levelFilter}
                  onChange={(event) => setLevelFilter(event.target.value)}
                >
                  <option value="ALL">Все строки</option>
                  <option value="ERROR">ERROR / FATAL</option>
                  <option value="WARN">WARN</option>
                  <option value="INFO">INFO</option>
                  <option value="DEBUG">DEBUG</option>
                </select>
              </label>
            </div>

            <div className="toolbar__actions">
              <label className="toolbar__search">
                <input
                  placeholder="Фильтр по тексту"
                  value={lineFilter}
                  onChange={(event) => setLineFilter(event.target.value)}
                />
              </label>
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
                <div>
                  <dt>Показано строк</dt>
                  <dd>
                    {filteredLines.length} / {content.content ? content.content.split('\n').length : 0}
                  </dd>
                </div>
              </dl>

              <pre className="mono-output">
                {filteredLines.length > 0 ? filteredLines.join('\n') : 'По текущему фильтру строк нет.'}
              </pre>
            </div>
          ) : (
            <div className="empty-state">Выберите источник логов, чтобы увидеть tail.</div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
